/**
 * Render `content` with a left margin showing 1-based line numbers. Normalises
 * CRLF and CR to LF first so the count matches what an editor would show, and
 * drops the trailing empty element that a final newline produces so we do not
 * number a phantom line after the last real one.
 */
export function addLineNumbers(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`).join("\n");
}
