/**
 * Utilities for normalizing and preprocessing LaTeX math expressions
 * before passing them to remark-math / rehype-katex / ReactMarkdown.
 *
 * Solves common LLM math formatting quirks:
 * 1. \[ ... \] and \( ... \) notation (LaTeX standard, not supported by default remark-math).
 * 2. $$ on the same line as content ($$A = \begin{pmatrix}...), which causes remark-math
 *    to treat the first line as code block meta and strip it, or fail to find the closing $$.
 * 3. Single-line display math ($$\text{tr}(A) = 505$$), which remark-math ignores by default.
 * 4. Unwrapped LaTeX environments (\begin{pmatrix}...\end{pmatrix}) without $$ delimiters.
 * 5. Preservation of code blocks so dollar signs in code are never touched.
 */

export function preprocessLaTeX(content: string): string {
  if (!content) return '';
  let text = content;

  // 0. Protect fenced code blocks (```...```) and inline code (`...`)
  const codeBlocks: string[] = [];
  text = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match);
    return `@@DEIZA_CODE_${codeBlocks.length - 1}@@`;
  });

  // 1. Normalize \[ ... \] display math to \n\n$$\n...\n$$\n\n
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    return `\n\n$$\n${math.trim()}\n$$\n\n`;
  });

  // 2. Normalize \( ... \) inline math to $...$
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 3. Normalize unwrapped LaTeX environments (pmatrix, bmatrix, cases, aligned, etc.)
  // Only wrap if not already enclosed within $$
  const envRegex = /\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|cases|aligned|align\*?|equation\*?|gather\*?|split)\}([\s\S]*?)\\end\{\1\}/g;
  text = text.replace(envRegex, (match, _env, _inner, offset, fullStr) => {
    const before = fullStr.slice(Math.max(0, offset - 4), offset);
    const after = fullStr.slice(offset + match.length, offset + match.length + 4);
    if (before.includes('$$') || after.includes('$$')) {
      return match;
    }
    return `\n\n$$\n${match.trim()}\n$$\n\n`;
  });

  // 4. Normalize $$ ... $$ display math (both single-line and multi-line)
  // Ensure $$ is isolated on its own lines with blank lines around it so remark-math
  // parses it cleanly as flow math and does NOT treat the first line as code meta!
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const trimmed = math.trim();
    if (!trimmed) return '';
    return `\n\n$$\n${trimmed}\n$$\n\n`;
  });

  // 5. Restore code blocks
  text = text.replace(/@@DEIZA_CODE_(\d+)@@/g, (_, idx) => {
    return codeBlocks[Number(idx)];
  });

  return text;
}
