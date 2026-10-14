/** Block-level tags whose boundaries are the only structure flattened HTML keeps. */
const HTML_BREAKS = /<\/?(p|div|br|tr|li|h[1-6]|blockquote|table)\b[^>]*>/gi;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * The words of an HTML fragment in reading order, with no DOM: scripts and
 * styles go, a block boundary becomes a line break, every other tag goes, and
 * entities are decoded. Deliberately crude, for markup nobody will render: an
 * HTML-only mail body, a notebook output with no plain-text form.
 */
export function flattenHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(HTML_BREAKS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (entity, code: string) => (Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : entity))
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}
