/**
 * ```artifact block detection shared by the chat (streaming and stored messages).
 *
 * The content of an artifact is markdown or code and routinely carries its own fenced blocks
 * (```chart, ```mermaid, ```python...). The closing fence of the artifact is therefore NOT the
 * first ``` after the opener: the JSON object is scanned with string awareness to find where it
 * ends, and when the JSON does not parse (unescaped quotes) the last line-start fence wins.
 * Mirrors deiza_mapper.artifacts.find_block on the backend.
 */
export const ARTIFACT_FENCE = '```artifact';

export type ArtifactSpec = { name: string; type: string; content: string };

export type ArtifactBlock = {
  start: number;      // index of the opening fence
  spec: string;       // JSON text between the fences
  end: number;        // index just past the closing fence (text.length when unterminated)
  partial: boolean;   // no closing fence found yet (stream in progress or cut)
};

/** Index just past the `}` closing the object that opens at `i`, or -1. Braces inside strings do not count. */
function scanObjectEnd(text: string, i: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}

/** Escape raw newlines / tabs that sit inside JSON string literals (models do that). */
export function fixJsonControlChars(s: string): string {
  let out = '', inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

function unescapeLoose(c: string): string {
  const SENTINEL = String.fromCharCode(1);
  return c
    .replace(/\\\\/g, SENTINEL)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .split(SENTINEL).join('\\');
}

/** name / type / content from a spec whose JSON does not parse. */
function tolerantSpec(spec: string): ArtifactSpec | null {
  const nameMatch = spec.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;
  const typeMatch = spec.match(/"type"\s*:\s*"([^"]+)"/);
  const name = nameMatch[1];
  const type = (typeMatch && typeMatch[1]) || (name.split('.').pop() || 'txt');
  const contentMatch = spec.match(/"content"\s*:\s*"([\s\S]*)/);
  let content = '';
  if (contentMatch) {
    let c = contentMatch[1];
    const tailCut = c.search(/(?<!\\)"\s*\}?\s*$/);
    if (tailCut >= 0) c = c.substring(0, tailCut);
    content = unescapeLoose(c);
  }
  return { name, type, content };
}

/** Parse a spec: strict JSON, then with control chars fixed, then tolerantly. */
export function parseArtifactSpec(spec: string): { art: ArtifactSpec | null; strict: boolean } {
  for (const candidate of [spec, fixJsonControlChars(spec)]) {
    try {
      const p: any = JSON.parse(candidate);
      if (p && typeof p === 'object' && p.name) {
        const content = typeof p.content === 'string' ? p.content
          : (p.content && typeof p.content === 'object' ? JSON.stringify(p.content) : '');
        return { art: { name: String(p.name), type: String(p.type || (String(p.name).split('.').pop() || 'txt')), content }, strict: true };
      }
    } catch { /* next */ }
  }
  return { art: tolerantSpec(spec), strict: false };
}

/** Locate the first ```artifact block in `text` (or the one opening at `from`). */
export function findArtifactBlock(text: string, from?: number): ArtifactBlock | null {
  if (!text) return null;
  const start = from !== undefined ? from : text.indexOf(ARTIFACT_FENCE);
  if (start < 0) return null;
  const bodyStart = start + ARTIFACT_FENCE.length;
  const candidates: ArtifactBlock[] = [];

  const brace = text.indexOf('{', bodyStart);
  if (brace >= 0 && !text.substring(bodyStart, brace).trim()) {
    const objEnd = scanObjectEnd(text, brace);
    if (objEnd > 0) {
      const close = text.indexOf('```', objEnd);
      if (close >= 0 && !text.substring(objEnd, close).trim()) candidates.push({ start, spec: text.substring(brace, objEnd), end: close + 3, partial: false });
      else candidates.push({ start, spec: text.substring(brace, objEnd), end: objEnd, partial: false });
    }
  }
  const body = text.substring(bodyStart);
  const lineFences: number[] = [];
  const re = /^[ \t]*```[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) lineFences.push(bodyStart + m.index);
  if (lineFences.length) {
    const last = lineFences[lineFences.length - 1];
    candidates.push({ start, spec: text.substring(bodyStart, last).trim(), end: text.indexOf('```', last) + 3, partial: false });
    const first = lineFences[0];
    if (first !== last) candidates.push({ start, spec: text.substring(bodyStart, first).trim(), end: text.indexOf('```', first) + 3, partial: false });
  }
  candidates.push({ start, spec: body.trim(), end: text.length, partial: true });

  const scored: { size: number; block: ArtifactBlock }[] = [];
  for (const block of candidates) {
    const { art, strict } = parseArtifactSpec(block.spec);
    if (!art) continue;
    if (strict) return block;
    scored.push({ size: art.content.length, block });
  }
  if (!scored.length) return candidates[candidates.length - 1];
  const tail = scored.filter(s => s.block.partial).reduce((a, s) => Math.max(a, s.size), 0);
  const closed = scored.filter(s => !s.block.partial);
  if (closed.length) {
    const best = closed.reduce((a, s) => (s.size > a.size ? s : a));
    if (best.size >= tail * 0.9) return best.block;
  }
  return scored.reduce((a, s) => (s.size > a.size ? s : a)).block;
}

/** The first artifact of a message, parsed. */
export function extractArtifact(text: string): ArtifactSpec | null {
  const block = findArtifactBlock(text);
  if (!block) return null;
  return parseArtifactSpec(block.spec).art;
}

/** The prose around the artifact block(s), for display. An unterminated block is dropped. */
export function stripArtifactBlocks(text: string): string {
  if (!text || text.indexOf(ARTIFACT_FENCE) < 0) return text || '';
  let out = '';
  let pos = 0;
  for (;;) {
    const start = text.indexOf(ARTIFACT_FENCE, pos);
    if (start < 0) { out += text.substring(pos); break; }
    out += text.substring(pos, start);
    const block = findArtifactBlock(text, start);
    if (!block || block.partial) break;
    pos = block.end;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
