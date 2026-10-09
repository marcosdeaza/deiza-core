/**
 * Normalizes LaTeX math in model output before remark-math / rehype-katex / ReactMarkdown.
 *
 * Works in one pass that knows where math already is, so it never wraps something that is
 * already inside a formula (the old version wrapped `\begin{pmatrix}` found inside
 * `$$A = \begin{pmatrix}…\end{pmatrix}$$` a second time and split the formula in two).
 *
 * Handles:
 * 1. Code blocks and inline code are left untouched (dollar signs in code are not math).
 * 2. `$$…$$`, `\[…\]` → display math with the delimiters on their own lines, keeping the
 *    indentation / blockquote prefix of the line so lists and quotes do not break.
 * 3. `\(…\)` → `$…$`.
 * 4. Bare environments (`\begin{pmatrix}…\end{pmatrix}`, cases, aligned, array…) written
 *    outside any delimiter → display math. A mismatched closing matrix environment
 *    (`\begin{vmatrix}…\end{pmatrix}`) is repaired to the opening one.
 * 5. Currency such as `$5 y $10` is escaped so it is not read as math.
 */

const MATRIX_ENVS = 'pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|smallmatrix';
const BARE_ENV = new RegExp(
  '\\\\begin\\{(' + MATRIX_ENVS + '|cases|dcases|rcases|aligned|alignedat|align\\*?|alignat\\*?|equation\\*?|gather\\*?|gathered|split|array|eqnarray\\*?|CD)\\}',
  'g',
);
const MISMATCHED_END = new RegExp('\\\\begin\\{(' + MATRIX_ENVS + ')\\}((?:(?!\\\\begin\\{|\\\\end\\{)[\\s\\S])*?)\\\\end\\{(' + MATRIX_ENVS + ')\\}', 'g');

function linePrefix(text: string, offset: number): string | null {
  // Text between the start of the line and `offset`. If it is only indentation, list or
  // quote markers, the formula starts the line and should keep that prefix.
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const head = text.slice(start, offset);
  if (/^[ \t]*(?:>[ \t]?)*[ \t]*$/.test(head)) return head;
  if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+$/.test(head)) return head.replace(/[^\t]/g, ' ');
  return null;
}

function displayBlock(math: string, prefix: string): string {
  const body = math
    .trim()
    .split('\n')
    .map((l) => prefix + (prefix.includes('>') ? l.replace(/^[ \t]*(?:>[ \t]?)*/, '') : l).trim())
    .join('\n');
  return `\n${prefix}$$\n${body}\n${prefix}$$\n`;
}

function findClose(text: string, from: number, close: string): number {
  // Next unescaped `close` after `from`.
  let i = from;
  while (i < text.length) {
    const j = text.indexOf(close, i);
    if (j < 0) return -1;
    let bs = 0;
    for (let k = j - 1; k >= 0 && text[k] === '\\'; k--) bs++;
    if (close.startsWith('\\') || bs % 2 === 0) return j;
    i = j + 1;
  }
  return -1;
}

function endOfEnv(text: string, from: number, env: string): number {
  // Index just after the `\end{env}` that closes the environment opened before `from`,
  // honouring nested environments of the same name.
  const open = '\\begin{' + env + '}';
  const close = '\\end{' + env + '}';
  let depth = 1;
  let i = from;
  while (depth > 0) {
    const o = text.indexOf(open, i);
    const c = text.indexOf(close, i);
    if (c < 0) return -1;
    if (o >= 0 && o < c) {
      depth++;
      i = o + open.length;
    } else {
      depth--;
      i = c + close.length;
    }
  }
  return i;
}

export function preprocessLaTeX(content: string): string {
  if (!content) return '';

  // 0. Protect code.
  const code: string[] = [];
  let text = content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g, (m) => {
    code.push(m);
    return `@@DEIZA_CODE_${code.length - 1}@@`;
  });

  // 1. Repair `\begin{vmatrix} … \end{pmatrix}` (the model mixes matrix brackets).
  text = text.replace(MISMATCHED_END, (m, a: string, body: string, b: string) =>
    a === b ? m : `\\begin{${a}}${body}\\end{${a}}`,
  );

  // 2. Single scan: copy text, turning every math region into a normalized placeholder.
  const math: string[] = [];
  const hold = (s: string) => {
    math.push(s);
    return `@@DEIZA_MATH_${math.length - 1}@@`;
  };
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && text[i + 1] === '\\') {
      out += '\\\\';
      i += 2;
      continue;
    }

    // \[ … \]  and  \( … \)
    if (ch === '\\' && (text[i + 1] === '[' || text[i + 1] === '(')) {
      const display = text[i + 1] === '[';
      const end = findClose(text, i + 2, display ? '\\]' : '\\)');
      if (end > 0) {
        const inner = text.slice(i + 2, end);
        if (display) {
          const p = linePrefix(text, i);
          out += hold(displayBlock(inner, p ?? ''));
        } else {
          out += hold(`$${inner.trim()}$`);
        }
        i = end + 2;
        continue;
      }
    }

    // Bare environment outside any delimiter.
    if (ch === '\\' && text.startsWith('\\begin{', i)) {
      BARE_ENV.lastIndex = i;
      const m = BARE_ENV.exec(text);
      if (m && m.index === i) {
        const env = m[1];
        const end = endOfEnv(text, i + m[0].length, env);
        if (end > 0) {
          const p = linePrefix(text, i);
          out += hold(displayBlock(text.slice(i, end), p ?? ''));
          i = end;
          continue;
        }
      }
    }

    if (ch === '$') {
      let bs = 0;
      for (let k = i - 1; k >= 0 && text[k] === '\\'; k--) bs++;
      if (bs % 2 === 1) {
        out += ch;
        i++;
        continue;
      }
      // $$ … $$
      if (text[i + 1] === '$') {
        const end = findClose(text, i + 2, '$$');
        if (end > 0) {
          const inner = text.slice(i + 2, end);
          if (inner.trim()) {
            const p = linePrefix(text, i);
            out += hold(displayBlock(inner, p ?? ''));
          }
          i = end + 2;
          continue;
        }
        out += '$$';
        i += 2;
        continue;
      }
      // $ … $ on one line
      const nl = text.indexOf('\n', i + 1);
      const lineEnd = nl < 0 ? text.length : nl;
      let end = -1;
      for (let k = i + 1; k < lineEnd; k++) {
        if (text[k] === '$' && text[k - 1] !== '\\' && text[k + 1] !== '$') {
          end = k;
          break;
        }
      }
      if (end > i + 1) {
        const inner = text.slice(i + 1, end);
        const currency =
          (/^\d[\d.,]*\s/.test(inner) && !/[\\^_={}]/.test(inner)) || /^\s|\s$/.test(inner);
        if (!currency) {
          out += hold(`$${inner}$`);
          i = end + 1;
          continue;
        }
      }
      // A lone or currency dollar: escape so remark-math leaves it as text.
      out += '\\$';
      i++;
      continue;
    }

    out += ch;
    i++;
  }
  text = out;

  // 3. Restore math, then code. Display blocks bring their own line breaks; make sure they
  // are separated from surrounding paragraphs by a blank line.
  text = text.replace(/@@DEIZA_MATH_(\d+)@@/g, (_, n) => math[Number(n)]);
  text = text.replace(/([^\n])\n([ \t>]*\$\$\n)/g, '$1\n\n$2');
  text = text.replace(/(\n[ \t>]*\$\$)\n(?=[^\n])/g, (m, a: string, off: number, full: string) => {
    // Only after a closing delimiter: the opening one is followed by the formula itself.
    const before = full.slice(0, off + a.length);
    const count = (before.match(/(^|\n)[ \t>]*\$\$(?=\n|$)/g) || []).length;
    return count % 2 === 0 ? `${a}\n\n` : m;
  });
  text = text.replace(/@@DEIZA_CODE_(\d+)@@/g, (_, n) => code[Number(n)]);
  return text;
}

/** Options shared by every rehype-katex instance (chat and artifact panel). */
export const KATEX_OPTIONS = {
  output: 'htmlAndMathml' as const,
  strict: false,
  trust: true,
  throwOnError: false,
  // Models write the euro sign as a command KaTeX does not define.
  macros: { '\\euro': '€', '\\EUR': '€', '\\eur': '€' },
};
