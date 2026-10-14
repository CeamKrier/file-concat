/** Block-level tags whose boundaries are the only structure flattened HTML keeps. */
const HTML_BREAKS = new Set(["p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table"]);

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

/** Elements that hold nothing, so a hidden one leaves nothing to drop. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const BLOCKS = ["p", "div", "table", "ul", "ol", "dl", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "hr"];
/**
 * Elements whose end tag may be left out (HTML 13.1.2.4), with the tags that
 * end them when it is: one that opens, or one that closes the element around.
 */
const IMPLIED: Readonly<Record<string, { opens: readonly string[]; closes: readonly string[] }>> = {
  p: { opens: BLOCKS, closes: ["div", "td", "th", "li", "body", "blockquote"] },
  li: { opens: ["li"], closes: ["ul", "ol", "body"] },
  td: { opens: ["td", "th", "tr", "tbody", "thead", "tfoot"], closes: ["tr", "table", "tbody", "thead", "tfoot"] },
  th: { opens: ["td", "th", "tr", "tbody", "thead", "tfoot"], closes: ["tr", "table", "tbody", "thead", "tfoot"] },
  tr: { opens: ["tr", "tbody", "thead", "tfoot"], closes: ["table", "tbody", "thead", "tfoot"] },
  dt: { opens: ["dt", "dd"], closes: ["dl"] },
  dd: { opens: ["dt", "dd"], closes: ["dl"] },
  option: { opens: ["option", "optgroup"], closes: ["select", "optgroup"] },
};
/** Tags that open a scope of their own, inside which those rules do not reach. */
const SCOPES = new Set(["table", "ul", "ol", "dl", "select"]);

/**
 * Whether an opening tag hides its element: the `hidden` attribute (not
 * `until-found`, which a find on the page reveals), or an inline
 * `display: none` or `visibility: hidden`. The set Readability and docling
 * drop; `aria-hidden` text is on screen and stays.
 */
function hides(tag: string): boolean {
  // Attribute values blanked first, so a class named "hidden" is not the attribute.
  const names = tag.replace(/"[^"]*"|'[^']*'/g, '""');
  if (/\shidden(?=[\s=/>])/i.test(names) && !/\shidden\s*=\s*["']?until-found/i.test(tag)) return true;
  const style = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  const css = (style?.[1] ?? style?.[2] ?? style?.[3] ?? "").replace(/\s+/g, "").toLowerCase();
  return /(?:^|;)display:none/.test(css) || /(?:^|;)visibility:(?:hidden|collapse)/.test(css);
}

/** Where the element whose opening tag ends at `from` ends, by tag name and nesting. */
function endOf(html: string, from: number, name: string): number {
  const implied = IMPLIED[name];
  let depth = 1;
  let scopes = 0;
  for (let at = html.indexOf("<", from); at >= 0; at = html.indexOf("<", at + 1)) {
    if (html.startsWith("<!--", at)) {
      at = html.indexOf("-->", at + 4);
      if (at < 0) break;
      continue;
    }
    const tag = /^<(\/?)([a-z][^\s/>]*)/i.exec(html.slice(at, at + 32));
    if (!tag) continue;
    const other = tag[2].toLowerCase();
    if (tag[1]) {
      if (other === name && --depth === 0) return (html.indexOf(">", at) + 1 || html.length);
      if (implied && scopes === 0 && implied.closes.includes(other)) return at;
      if (SCOPES.has(other)) scopes = Math.max(0, scopes - 1);
    } else {
      if (implied && scopes === 0 && implied.opens.includes(other)) return at;
      if (other === name) depth++;
      if (SCOPES.has(other)) scopes++;
    }
  }
  return html.length;
}

/** Whether `html` between `from` and `to` has a character outside a tag that is not white space. */
function hasText(html: string, from: number, to: number): boolean {
  let inTag = false;
  for (let at = from; at < to; at++) {
    const char = html[at];
    if (char === "<") inTag = true;
    else if (char === ">") inTag = false;
    else if (!inTag && char.trim()) return true;
  }
  return false;
}

/**
 * `html` without the elements its author hid (Q18 O1), found by tag name and
 * nesting with no DOM, the way a streaming parser such as htmlparser2 tracks
 * them, and how many of those held text. A comment is passed over whole, as
 * one may hold a tag. Each tag is read once, so a crafted body costs one pass.
 *
 * ponytail: inline styles only; a `<style>` rule that hides a class, and an
 * unclosed `<span>` the browser would close at its parent's end, are not
 * resolved.
 */
export function withoutHiddenHtml(html: string): { html: string; hidden: number } {
  const out: string[] = [];
  let hidden = 0;
  let kept = 0;
  for (let at = html.indexOf("<"); at >= 0; ) {
    const close = html.indexOf(html.startsWith("<!--", at) ? "-->" : ">", at);
    if (close < 0) break;
    const name = /^<([a-z][^\s/>]*)/i.exec(html.slice(at, at + 32))?.[1]?.toLowerCase();
    const tag = name && !VOID.has(name) ? html.slice(at, close + 1) : "";
    if (!name || !tag || tag.endsWith("/>") || !hides(tag)) {
      at = html.indexOf("<", close + 1);
      continue;
    }
    const end = endOf(html, close + 1, name);
    out.push(html.slice(kept, at));
    if (hasText(html, close + 1, end)) hidden++;
    kept = end;
    at = html.indexOf("<", end);
  }
  if (out.length === 0) return { html, hidden: 0 };
  out.push(html.slice(kept));
  return { html: out.join(""), hidden };
}

/**
 * `html` with each tag replaced by what `visit` returns for it, or kept when it
 * returns nothing. With `strip`, comments, declarations and the bodies of
 * `script` and `style` go too, an unclosed one to the end as a browser reads
 * it. One pass over the tags in the way of a streaming tokenizer, such as
 * htmlparser2: the patterns this replaced (`<[^>]+>`, `<!--[\s\S]*?-->`) rescan
 * the rest of the body from every unclosed `<`, and 40,000 of them held a tab
 * for seconds (2026-10-15). A `<` that opens no tag, as in `a < b`, is text.
 */
export function mapTags(html: string, visit: (name: string, closing: boolean) => string | undefined, strip = false): string {
  const out: string[] = [];
  let kept = 0;
  const replace = (from: number, to: number, text: string) => {
    out.push(html.slice(kept, from), text);
    kept = to;
  };
  for (let at = html.indexOf("<"); at >= 0; ) {
    const comment = html.startsWith("<!--", at);
    if (comment || html[at + 1] === "!" || html[at + 1] === "?") {
      const close = comment ? html.indexOf("-->", at + 4) : html.indexOf(">", at);
      const end = close < 0 ? html.length : close + (comment ? 3 : 1);
      if (strip) replace(at, end, "");
      at = html.indexOf("<", end);
      continue;
    }
    const tag = /^<(\/?)([a-z][^\s/>]*)/i.exec(html.slice(at, at + 64));
    const close = tag ? html.indexOf(">", at) : at;
    if (close < 0) break;
    if (!tag) {
      at = html.indexOf("<", at + 1);
      continue;
    }
    const name = tag[2].toLowerCase();
    const closing = tag[1] === "/";
    let end = close + 1;
    let text = visit(name, closing);
    if (strip && !closing && (name === "script" || name === "style")) {
      end = rawTextEnd(html, end, name);
      text = "";
    }
    if (text !== undefined) replace(at, end, text);
    at = html.indexOf("<", end);
  }
  if (out.length === 0) return html;
  out.push(html.slice(kept));
  return out.join("");
}

/** Past the end tag of a `script` or `style` body that starts at `from`, or the end of `html`. */
function rawTextEnd(html: string, from: number, name: string): number {
  for (let at = html.indexOf("</", from); at >= 0; at = html.indexOf("</", at + 2)) {
    const after = html[at + 2 + name.length];
    if (html.slice(at + 2, at + 2 + name.length).toLowerCase() !== name || (after && !/[\s/>]/.test(after))) continue;
    const close = html.indexOf(">", at);
    return close < 0 ? html.length : close + 1;
  }
  return html.length;
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
  const cell = (name: string, closing: boolean) => closing && (name === "td" || name === "th");
  return mapTags(html, (name, closing) => (cell(name, closing) ? " | " : HTML_BREAKS.has(name) ? "\n" : ""), true)
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
