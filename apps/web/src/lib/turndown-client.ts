import TurndownService from "turndown";

/**
 * Remove what the author hid from `root` and say how many hidden elements held
 * text (Q18 O1): the `hidden` attribute and an inline `display: none` or
 * `visibility: hidden`, the set Readability skips when it picks an article.
 * The whole-body fallback and the ebook reader kept them. `aria-hidden` stays:
 * that text is on screen, only kept from a screen reader, and so does
 * `hidden="until-found"`, which a find on the page reveals.
 *
 * Zero opacity and zero font size stay too, measured on saved pages: a
 * carousel's captions sit at opacity 0 until script fades them in, and a zero
 * font size on a container is the usual fix for gaps between inline blocks,
 * whose children set their own.
 *
 * ponytail: inline styles only; a stylesheet rule or white-on-white text needs
 * computed styles, which a parsed document has no layout for.
 */
export function dropHidden(root: Element): number {
  let dropped = 0;
  for (const element of root.querySelectorAll<HTMLElement>("[hidden], [style]")) {
    // Already gone with a hidden ancestor.
    if (!root.contains(element)) continue;
    // Keywords come back lowercased, whatever case the author wrote. A MathML
    // node may have no style at all, as Readability's own check allows for.
    const display = element.style?.display;
    const visibility = element.style?.visibility;
    const hidden =
      (element.hasAttribute("hidden") && element.getAttribute("hidden")?.toLowerCase() !== "until-found") ||
      display === "none" ||
      visibility === "hidden" ||
      visibility === "collapse";
    if (!hidden) continue;
    if (element.textContent?.trim()) dropped++;
    element.remove();
  }
  return dropped;
}

/**
 * React's streamed server rendering, done the way the page's own script does
 * it. Content that finished late is written as `<div hidden id="S:n">` near
 * the end of the body, and an inline call moves it into place: `$RC(boundary,
 * segment)` swaps it for a Suspense boundary's fallback (between `<!--$?-->`
 * and `<!--/$-->`), `$RS(segment, placeholder)` for a `<template>`. Read as
 * saved, the page shows only the fallbacks and the content counts as hidden.
 * A call whose ids are not on the page, or whose segment holds its own
 * target, is skipped, as React's would fail.
 */
export function withStreamedSegments(doc: Document): void {
  const scripts = Array.from(doc.querySelectorAll("script"), (script) => script.textContent ?? "").join("\n");
  for (const [, kind, first, second] of scripts.matchAll(/\$R([CS])\("([^"]+)","([^"]+)"\)/g)) {
    const [target, segment] = kind === "C" ? [doc.getElementById(first), doc.getElementById(second)] : [doc.getElementById(second), doc.getElementById(first)];
    if (!target || !segment?.hasAttribute("hidden") || segment.contains(target)) continue;
    if (kind === "C") {
      // The fallback runs from the boundary's template to its closing comment.
      let depth = 0;
      for (let node = target.nextSibling; node; ) {
        const next = node.nextSibling;
        if (node.nodeType === 8) {
          const mark = (node as Comment).data;
          if (mark === "/$" && depth-- === 0) break;
          if (mark.startsWith("$")) depth++;
        }
        node.remove();
        node = next;
      }
    }
    target.replaceWith(...Array.from(segment.childNodes));
    segment.remove();
  }
}

/** Inputs that draw the text they hold. A password field draws dots, and its value stays out. */
const TEXT_INPUTS = new Set(["", "text", "search", "email", "url", "tel", "number", "date", "datetime-local", "month", "week", "time"]);

/**
 * Each form control in `root` as the text it draws: a text field's value, a
 * closed list's selected option, a list box's rows, a text area's text.
 * Readability removes every control, and Turndown writes an option list as
 * one run of words. A form becomes a plain box, so the text around its
 * controls stays. An `iframe` with its document inline (`srcdoc`) draws that
 * document, which becomes its content here, first, so its controls are
 * written the same way.
 */
export function drawnControls(root: Element): void {
  const doc = root.ownerDocument;
  const text = (control: Node, value: string) => control.parentNode?.replaceChild(doc.createTextNode(value ? ` ${value} ` : ""), control);
  for (const frame of root.querySelectorAll("iframe[srcdoc]")) {
    const inner = new DOMParser().parseFromString(frame.getAttribute("srcdoc") ?? "", "text/html").body;
    const box = doc.createElement("div");
    for (const node of Array.from(inner.childNodes)) box.appendChild(doc.importNode(node, true));
    frame.replaceWith(box);
  }
  for (const input of root.querySelectorAll("input")) {
    if (TEXT_INPUTS.has((input.getAttribute("type") ?? "").toLowerCase())) text(input, input.getAttribute("value")?.trim() ?? "");
  }
  for (const select of root.querySelectorAll("select")) {
    // A list box shows its rows; a closed list, the default, its selected one.
    const options = Array.from(select.querySelectorAll("option"));
    const shown = select.multiple || select.size > 1 ? options : [select.querySelector("option[selected]") ?? options[0]];
    text(select, shown.map((option) => option?.textContent?.trim()).filter(Boolean).join(", "));
  }
  for (const area of root.querySelectorAll("textarea")) text(area, area.textContent?.trim() ?? "");
  // With its controls written out a form is a box of text, and Readability,
  // which drops a form whole when it scores low, now weighs it as one.
  for (const form of root.querySelectorAll("form")) {
    const box = doc.createElement("div");
    for (const node of Array.from(form.childNodes)) box.appendChild(node);
    form.replaceWith(box);
  }
}

/**
 * HTML to Markdown for the readers that hold a DOM: saved web pages and
 * ebooks. The options and the link rule are the clipper's (`apps/extension/
 * src/article.ts`), copied rather than shared because the extension is not a
 * workspace package. Client-only, like its callers.
 */
export function turndown(base: string): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  // A figure's own content (its image, with the alt text, or a table) and
  // then its caption; the caption alone dropped the image's alt (Q31 O1).
  service.addRule("figcaption", {
    filter: (node) => node.nodeName === "FIGCAPTION" && node.parentElement?.nodeName === "FIGURE",
    replacement: () => "",
  });
  service.addRule("figure", {
    filter: "figure",
    replacement: (content, node) => {
      const caption = (node as HTMLElement).querySelector("figcaption")?.textContent?.trim();
      return `\n\n${[content.trim(), caption ? `_${caption}_` : ""].filter(Boolean).join("\n\n")}\n\n`;
    },
  });
  // A same-origin link becomes its own text: its href is a path on the site
  // that the anchor text already names, so in a bundle billed by the token it
  // is pure cost. An external link points somewhere the prose does not say.
  service.addRule("sameOriginLink", {
    filter: (node) => node.nodeName === "A" && !!node.getAttribute("href"),
    replacement: (content, node) => {
      if (!content.trim()) return "";
      let resolved: URL;
      try {
        resolved = new URL(node.getAttribute("href") ?? "", base);
      } catch {
        return content;
      }
      if (resolved.protocol === "mailto:") return `[${content}](${resolved.href})`;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return content;
      return resolved.origin === new URL(base).origin ? content : `[${content}](${resolved.href})`;
    },
  });
  // A summary is the line a closed `details` shows; Turndown has no block
  // rule for it and ran it into the body.
  service.addRule("summary", { filter: "summary", replacement: (content) => `\n\n${content.trim()}\n\n` });
  addTableRules(service);
  service.addRule("math", { filter: (node) => node.nodeName.toLowerCase() === "math", replacement: (_content, node) => math(node as Element) });
  service.addRule("svg", { filter: (node) => node.nodeName.toLowerCase() === "svg", replacement: (_content, node) => svg(node as Element) });
  // A form's text stays: a page builder may wrap a whole page in one.
  service.remove(["script", "style", "noscript", "iframe", "button", "template"]);
  return service;
}

/**
 * A formula as its TeX source, `$...$` (`$$` on its own lines for a block),
 * the way Joplin's turndown rule and pandoc write it (Q29 O1): an LLM reads
 * TeX, and the rendered symbols run together. Without a TeX annotation the
 * author's `alttext`, else the drawn tokens spaced apart. The annotation is
 * never printed beside the formula, which is what leaked before (C8).
 */
function math(node: Element): string {
  // The outer formula reads the whole tree; a nested one's output is dropped.
  if (node.parentElement?.closest("math")) return "";
  const tex = [...node.querySelectorAll("annotation")].find((note) => /tex/i.test(note.getAttribute("encoding") ?? ""))?.textContent?.trim();
  if (tex) return node.getAttribute("display") === "block" ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
  const alt = node.getAttribute("alttext")?.trim();
  if (alt) return alt;
  const tokens = [...node.querySelectorAll("mi, mn, mo, mtext, ms")].filter((token) => !token.closest("annotation-xml"));
  return tokens.map((token) => token.textContent?.trim()).filter(Boolean).join(" ");
}

/**
 * An inline drawing: its title and description as a label, `[Image: title;
 * desc]`, then the text it draws. Before, all three ran into one word (C8).
 * An `aria-hidden` drawing is decoration, so its label goes; drawn text is on
 * screen either way.
 */
function svg(node: Element): string {
  if (node.parentElement?.closest("svg")) return "";
  const own = (name: string) => [...node.children].find((child) => child.nodeName.toLowerCase() === name)?.textContent?.trim();
  const label = node.getAttribute("aria-hidden") === "true" ? [] : [own("title"), own("desc")].filter(Boolean);
  const drawn = [...node.querySelectorAll("text")].map((text) => text.textContent?.trim()).filter(Boolean);
  const out = [label.length ? `[Image: ${label.join("; ")}]` : "", ...drawn].filter(Boolean).join(" ");
  if (!out) return "";
  // Spaced from the words beside it only where the source has no space.
  const text = (sibling: ChildNode | null) => (sibling?.nodeType === 3 ? sibling.textContent ?? "" : "");
  const before = /\S$/.test(text(node.previousSibling)) ? " " : "";
  const after = /^\S/.test(text(node.nextSibling)) ? " " : "";
  return before + out + after;
}

/**
 * A table as a Markdown pipe table, so its rows and columns survive (C4);
 * Turndown alone writes each cell as its own paragraph. The shape is the one
 * Joplin's maintained fork of turndown-plugin-gfm writes, against markdownify
 * and pandoc: every table, not only one with a heading row; an empty heading
 * row when the table has none, since a pipe table needs one; `|` escaped; a
 * cell's line breaks as spaces; a `colspan` as that many cells. A table that
 * holds a table, the layout kind, and a one-cell table stay as text, as
 * Joplin and docling flatten them. Rows that are all empty, a layout
 * table's spacers, go.
 *
 * ponytail: `rowspan` is not filled in, so a spanned column shifts left in the
 * rows below it; pad from the row above if a real table needs it.
 */
function addTableRules(service: TurndownService): void {
  const tables = new WeakMap<Node, { pipe: boolean; columns: number; first?: HTMLTableRowElement }>();
  const shape = (table: Node | null) => {
    if (!table) return undefined;
    let known = tables.get(table);
    if (!known) {
      const element = table as HTMLTableElement;
      const rows = [...element.rows];
      const columns = rows.reduce((widest, row) => Math.max(widest, [...row.cells].reduce((sum, cell) => sum + span(cell), 0)), 0);
      const cells = rows.reduce((sum, row) => sum + row.cells.length, 0);
      known = { pipe: cells > 1 && columns <= MAX_COLUMNS && !element.querySelector("table"), columns, first: rows.find(filled) };
      tables.set(table, known);
    }
    return known;
  };
  const tableOf = (node: Node) => (node as Element).closest("table");
  const inPipe = (node: Node) => !!shape(tableOf(node))?.pipe;

  service.addRule("tableCell", {
    filter: (node) => (node.nodeName === "TD" || node.nodeName === "TH") && inPipe(node),
    replacement: (content, node) => {
      const text = content.replace(/\s+/g, " ").trim().split("|").join("\\|");
      return ` ${text} |${" |".repeat(span(node as HTMLTableCellElement) - 1)}`;
    },
  });
  service.addRule("tableRow", {
    filter: (node) => node.nodeName === "TR" && inPipe(node),
    replacement: (content, node) => {
      const row = node as HTMLTableRowElement;
      if (!filled(row)) return "";
      const { columns, first } = shape(tableOf(row)) ?? { columns: 0 };
      const line = `|${content}${" |".repeat(Math.max(0, columns - [...row.cells].reduce((sum, cell) => sum + span(cell), 0)))}\n`;
      const rule = `|${" --- |".repeat(columns)}\n`;
      if (first !== row) return line;
      const heading = row.parentElement?.nodeName === "THEAD" || [...row.cells].every((cell) => cell.nodeName === "TH");
      return heading ? line + rule : `|${"  |".repeat(columns)}\n${rule}${line}`;
    },
  });
  // A browser draws a tfoot below the body wherever the source puts it.
  const feet = new WeakMap<Node, string>();
  service.addRule("tableSection", {
    filter: (node) => ["THEAD", "TBODY", "TFOOT"].includes(node.nodeName) && inPipe(node),
    replacement: (content, node) => {
      if (node.nodeName !== "TFOOT") return content;
      const table = tableOf(node) as Node;
      feet.set(table, (feet.get(table) ?? "") + content);
      return "";
    },
  });
  service.addRule("tableCaption", {
    filter: (node) => node.nodeName === "CAPTION" && inPipe(node),
    replacement: (content) => (content.trim() ? `${content.trim()}\n\n` : ""),
  });
  service.addRule("table", {
    filter: (node) => node.nodeName === "TABLE" && !!shape(node)?.pipe,
    replacement: (content, node) => `\n\n${(content + (feet.get(node) ?? "")).trim()}\n\n`,
  });
}

const span = (cell: HTMLTableCellElement) => Math.min(Math.max(cell.colSpan || 1, 1), 1000);

/**
 * Past this many columns a table stays as text. Every row is padded to the
 * widest, so one row of `colspan=1000` cells would otherwise turn a few
 * kilobytes of HTML into gigabytes. The widest of 149 tables on 318 real
 * pages had 12 (2026-10-15).
 */
const MAX_COLUMNS = 100;

/** Whether a row holds any text; the first one carries the heading rule. */
const filled = (row: HTMLTableRowElement) => [...row.cells].some((cell) => cell.textContent?.trim());
