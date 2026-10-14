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
  "&copy;": "\u00a9",
  "&reg;": "\u00ae",
  "&trade;": "\u2122",
  "&hellip;": "\u2026",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201c",
  "&rdquo;": "\u201d",
  "&bull;": "\u2022",
  "&middot;": "\u00b7",
  "&euro;": "\u20ac",
};

/**
 * A line less the separators after its last cell, so a row of a layout table's
 * empty cells empties. A loop, not `/[ |]+$/`, which backtracks quadratically
 * on a long run of empty cells mid-line.
 */
function trimCells(line: string): string {
  let end = line.length;
  for (let at = end; ; ) {
    while (at > 0 && line[at - 1] === " ") at--;
    if (at === 0 || line[at - 1] !== "|") break;
    end = --at;
  }
  return line.slice(0, end).trimEnd();
}

/**
 * The words of an HTML fragment in reading order, with no DOM: comments,
 * scripts and styles go (Word hides its settings in a comment, `<!--[if gte
 * mso 9]><xml>`), a block boundary becomes a line break, a table cell ends
 * in ` | ` so a row reads as its cells, every other tag goes, and entities are
 * decoded. Deliberately crude, for markup nobody will render: an
 * HTML-only mail body, a notebook output with no plain-text form.
 */
export function flattenHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/t[dh]\s*>/gi, " | ")
    .replace(HTML_BREAKS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (entity, hex: string | undefined, dec: string) => {
      const code = hex ? parseInt(hex, 16) : Number(dec);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .split("\n")
    .map(trimCells)
    .join("\n");
}
