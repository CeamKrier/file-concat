import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { withOdfAltText, withRtfAltText, withWordAltText } from "./alt-text";
import { attr, decodeXml, escapeXml, tagsOf } from "./office-charts";
import { withOdfFormValues, withWordFieldLinks, withWordFormFields } from "./office-links";
import { withOdfListLabels } from "./office-lists";
import { withoutHiddenRtf } from "./rtf-hidden";
import { symbolFontChar } from "./symbol-font";

/**
 * Text the author hid, taken out before the document is read (Q18 O1): a
 * paste into a model is the case the 0DIN hidden-span injection write-up
 * describes, and the user cannot review text they cannot see. pandoc drops RTF
 * hidden text the same way; Tika, docling and mammoth keep a docx's, for
 * search indexing.
 *
 * Word part by part: a run whose own properties say `w:vanish` loses its
 * text, and so does a content control still showing its placeholder prompt
 * (`w:showingPlcHdr`, Word's grey "Click or tap here to enter text."), which
 * is the template talking, not the author. `w:specVanish` hides no text and
 * `w:webHidden` hides only in web view, so neither counts.
 *
 * ponytail: run properties only; a run hidden through its character style
 * stays. Resolving styles means reading styles.xml and its inheritance chain.
 */

interface Run {
  hidden: boolean;
  text: boolean;
}
interface Control {
  placeholder: boolean;
  content: boolean;
}

/** A boolean property is on unless its `w:val` says 0, false or off (ECMA-376 17.17.4). */
const on = (tag: string) => !/\sw:val="(?:0|false|off)"/.test(tag);

/**
 * One Word XML part with hidden runs, showing placeholders and the source of a
 * tracked move (`w:moveFrom`, a deletion the reader would print beside the
 * `w:moveTo` copy) emptied, and how many hidden runs held text.
 */
export function withoutHiddenRuns(xml: string): { xml: string; hidden: number } {
  const open: string[] = [];
  const runs: Run[] = [];
  const controls: Control[] = [];
  const out: string[] = [];
  let hidden = 0;
  // Content controls open around this point that are showing their prompt.
  let prompts = 0;
  // Tracked moves open around this point, whose text sits at the destination.
  let moves = 0;
  let kept = 0;
  let dropping = false;
  // Tags found by index, never by a pattern over the whole part, so a crafted
  // part cannot make the scan quadratic.
  for (let at = xml.indexOf("<"); at >= 0; at = xml.indexOf("<", at)) {
    const end = xml.indexOf(">", at);
    if (end < 0) break;
    const tag = xml.slice(at, end + 1);
    // The declaration, comments and processing instructions open nothing.
    if (tag[1] === "?" || tag[1] === "!") {
      at = end + 1;
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag.slice(closing ? 2 : 1).match(/^[^\s/>]+/)?.[0] ?? "";
    const parent = open[open.length - 1];
    if (closing) {
      if (name === "w:t" && dropping) {
        kept = at;
        dropping = false;
      }
      if (name === "w:r" && runs.pop()?.text) hidden++;
      if (name === "w:moveFrom" && moves > 0) moves--;
      if (name === "w:sdt") {
        const control = controls.pop();
        if (control?.placeholder && control.content) prompts--;
      }
      open.pop();
    } else {
      const empty = tag.endsWith("/>");
      if (name === "w:vanish" && parent === "w:rPr" && open[open.length - 2] === "w:r" && runs.length && on(tag)) {
        runs[runs.length - 1].hidden = true;
      } else if (name === "w:showingPlcHdr" && parent === "w:sdtPr" && controls.length && on(tag)) {
        controls[controls.length - 1].placeholder = true;
      } else if (name === "w:sdtContent" && parent === "w:sdt" && controls.length && !controls[controls.length - 1].content) {
        const control = controls[controls.length - 1];
        control.content = true;
        if (control.placeholder) prompts++;
      } else if (name === "w:t" && !empty) {
        const run = runs[runs.length - 1];
        const prompt = prompts > 0 || moves > 0;
        if (run?.hidden || prompt) {
          out.push(xml.slice(kept, end + 1));
          dropping = true;
          if (run?.hidden && !prompt) run.text = true;
        }
      }
      if (!empty) {
        open.push(name);
        if (name === "w:r") runs.push({ hidden: false, text: false });
        if (name === "w:sdt") controls.push({ placeholder: false, content: false });
        if (name === "w:moveFrom") moves++;
      }
    }
    at = end + 1;
  }
  if (out.length === 0) return { xml, hidden: 0 };
  out.push(xml.slice(kept));
  return { xml: out.join(""), hidden };
}

/**
 * A Word part with each paragraph whose mark is a tracked deletion
 * (`w:pPr/w:rPr/w:del`) joined to the paragraph after it, as accepting the
 * change does. pandoc does the same with changes accepted (`docxPrevPara`):
 * the text moves into the next paragraph, which keeps its own properties.
 * A paragraph followed by anything but another paragraph stays as it is.
 */
export function withDeletedMarksJoined(xml: string): string {
  if (!xml.includes("<w:del ")) return xml;
  type Edit = { from: number; to: number; text: string };
  const open: string[] = [];
  const paragraphs: Array<{ from: number; head: number; marked: boolean; carry: string }> = [];
  const edits: Edit[] = [];
  // A closed paragraph whose mark is deleted, joined if a paragraph comes next.
  let pending: { from: number; to: number; text: string; inserted?: Edit } | undefined;
  let carry = "";
  for (const t of tagsOf(xml)) {
    if (pending) {
      if (t.name === "w:p" && t.opens && !t.closes && !xml.slice(pending.to, t.from).trim()) {
        if (pending.inserted) pending.inserted.text = "";
        edits.push({ from: pending.from, to: pending.to, text: "" });
        carry = pending.text;
      }
      pending = undefined;
    }
    // Ancestors before this tag; for a closing tag the last is the element itself.
    const up = (n: number) => open[open.length - n];
    const paragraph = paragraphs[paragraphs.length - 1];
    if (t.name === "w:p" && t.opens && !t.closes) {
      paragraphs.push({ from: t.from, head: t.to, marked: false, carry });
      carry = "";
    } else if (paragraph && t.name === "w:pPr" && !t.opens && up(2) === "w:p") {
      paragraph.head = t.to;
    } else if (paragraph && t.name === "w:del" && t.opens && up(1) === "w:rPr" && up(2) === "w:pPr" && up(3) === "w:p") {
      paragraph.marked = true;
    } else if (paragraph && t.name === "w:p" && !t.opens) {
      paragraphs.pop();
      const inserted = paragraph.carry ? { from: paragraph.head, to: paragraph.head, text: paragraph.carry } : undefined;
      if (inserted) edits.push(inserted);
      if (paragraph.marked) pending = { from: paragraph.from, to: t.to, text: paragraph.carry + xml.slice(paragraph.head, t.from), inserted };
    }
    if (t.opens && !t.closes) open.push(t.name);
    else if (!t.opens) open.pop();
  }
  // An insertion into a paragraph that was itself joined on is dropped.
  const kept = edits.filter((edit) => edit.text || edit.to > edit.from).sort((a, b) => a.from - b.from);
  if (!kept.length) return xml;
  const out: string[] = [];
  let at = 0;
  for (const edit of kept) {
    out.push(xml.slice(at, edit.from), edit.text);
    at = edit.to;
  }
  return out.join("") + xml.slice(at);
}

/**
 * Past this many bytes unpacked the docx is read as it is, hidden text and
 * all: the rewrite unpacks every part, media included, which the reader
 * itself may never do.
 *
 * ponytail: fails open on a document past the cap; rewrite the parts in
 * place, without unpacking the rest, if real documents reach it.
 */
const MAX_REWRITE = 256 * 1024 * 1024;

/** The parts of a docx that hold runs: the body, headers, footers, notes and comments. */
const WORD_PART = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;

/** A deck's slides. */
const SLIDE_PART = /^ppt\/slides\/slide\d+\.xml$/;

/**
 * A slide with the text of each table cell merged into the one before it
 * taken out (ECMA-376 21.1.3.16, `hMerge` and `vMerge`), and how many such
 * cells held text. PowerPoint draws a merged range from its first cell, but
 * the others can still carry text, and docling, Tika and markitdown read
 * them without checking either attribute. The cell stays, empty, so the
 * columns after it keep their place.
 */
export function withoutMergedCells(xml: string): { xml: string; hidden: number } {
  if (!/\s[hv]Merge="/.test(xml)) return { xml, hidden: 0 };
  const cuts: Array<[number, number]> = [];
  let hidden = 0;
  let merged = false;
  let held = false;
  let text = -1;
  for (const t of tagsOf(xml)) {
    if (t.name === "a:tc" && !t.closes) {
      merged = /\s[hv]Merge="(?:1|true)"/.test(t.tag);
      held = false;
    } else if (t.name === "a:tc" && !t.opens) {
      if (merged && held) hidden++;
      merged = false;
    } else if (merged && t.name === "a:t") {
      if (!t.closes) text = t.to;
      else if (!t.opens && text >= 0) {
        if (xml.slice(text, t.from).trim()) held = true;
        cuts.push([text, t.from]);
        text = -1;
      }
    }
  }
  if (!cuts.length) return { xml, hidden: 0 };
  let out = "";
  let kept = 0;
  for (const [from, to] of cuts) {
    out += xml.slice(kept, from);
    kept = to;
  }
  return { xml: out + xml.slice(kept), hidden };
}

/**
 * A ruby run as `base(reading)`, the way an ODT ruby and HTML's `rp` fallback
 * read; officeparser drops both halves (C8). The ruby's own run is closed
 * before and reopened after, so base and reading become runs of the
 * paragraph. Read by index: an unclosed `<w:ruby>` stops the scan.
 */
function withRubyText(xml: string): string {
  const inner = (from: string, open: string, close: string) => {
    const start = from.indexOf(open);
    const end = start < 0 ? -1 : from.indexOf(close, start);
    return end < 0 ? "" : from.slice(start + open.length, end);
  };
  let out = "";
  let at = 0;
  for (;;) {
    const start = xml.indexOf("<w:ruby>", at);
    const end = start < 0 ? -1 : xml.indexOf("</w:ruby>", start);
    if (end < 0) break;
    const ruby = xml.slice(start, end);
    out += `${xml.slice(at, start)}</w:r>${inner(ruby, "<w:rubyBase>", "</w:rubyBase>")}<w:r><w:t>(</w:t></w:r>${inner(ruby, "<w:rt>", "</w:rt>")}<w:r><w:t>)</w:t></w:r><w:r>`;
    at = end + "</w:ruby>".length;
  }
  return at === 0 ? xml : out + xml.slice(at);
}

/**
 * A symbol-font character (`w:sym`, such as the Symbol font's alpha) and a
 * non-breaking hyphen as the text they draw; officeparser drops both, so the
 * words around them run together. pandoc writes the hyphen as
 * U+2011; the plain hyphen here is the character a reader searches for.
 */
function withWordSymbols(xml: string): string {
  return xml.replace(/<w:noBreakHyphen\b[^>]*?(?:\/>|>\s*<\/w:noBreakHyphen>)/g, "<w:t>-</w:t>").replace(/<w:sym\b([^>]*?)\/>/g, (tag, attributes: string) => {
    const font = /\sw:font="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const code = /\sw:char="([0-9A-Fa-f]{1,4})"/.exec(attributes)?.[1];
    const char = code === undefined ? undefined : symbolFontChar(font, parseInt(code, 16));
    return char ? `<w:t xml:space="preserve">${escapeXml(char)}</w:t>` : tag;
  });
}

/** What an OpenDocument style hides: text, a sheet, or a slide. */
interface OdfHiddenStyles {
  text: Set<string>;
  table: Set<string>;
  page: Set<string>;
}

const STYLE_NAME = /\sstyle:name="([^"]*)"/;
const ELEMENT_STYLE = /\s(?:text|table|draw):style-name="([^"]*)"/;
const SHEET_NAME = /\stable:name="([^"]*)"/;

/**
 * The styles in an OpenDocument part that hide what uses them: a text style
 * with `text:display="none"` (Format > Character > Hidden), a table style with
 * `table:display="false"` (a hidden sheet), a drawing-page style with
 * `presentation:visibility="hidden"` (a hidden slide).
 */
function collectHiddenStyles(xml: string, into: OdfHiddenStyles): void {
  for (let at = xml.indexOf("<style:style "); at >= 0; ) {
    const open = xml.indexOf(">", at);
    if (open < 0) return;
    const name = STYLE_NAME.exec(xml.slice(at, open + 1))?.[1];
    const end = xml[open - 1] === "/" ? open : xml.indexOf("</style:style>", open);
    if (end < 0) return;
    // Each property tag taken by index, never by a pattern over the body, so a
    // crafted style cannot make the scan quadratic.
    for (let tag = xml.indexOf("<", open); name && tag >= 0 && tag < end; ) {
      const close = xml.indexOf(">", tag);
      if (close < 0) break;
      const properties = xml.slice(tag, close + 1);
      if (properties.startsWith("<style:text-properties") && /\stext:display="none"/.test(properties)) into.text.add(name);
      if (properties.startsWith("<style:table-properties") && /\stable:display="false"/.test(properties)) into.table.add(name);
      if (properties.startsWith("<style:drawing-page-properties") && /\spresentation:visibility="hidden"/.test(properties)) {
        into.page.add(name);
      }
      tag = xml.indexOf("<", close + 1);
    }
    at = xml.indexOf("<style:style ", end);
  }
}

/** Whether `xml` between `from` and `to` holds a character outside a tag that is not white space. */
function hasText(xml: string, from: number, to: number): boolean {
  let inTag = false;
  for (let at = from; at < to; at++) {
    const char = xml[at];
    if (char === "<") inTag = true;
    else if (char === ">") inTag = false;
    else if (!inTag && char.trim()) return true;
  }
  return false;
}

/**
 * An OpenDocument `content.xml` with what its author hid taken out (Q18 O1):
 * a section or field with `text:display="none"`, a paragraph a hidden-paragraph field
 * hides (`text:is-hidden="true"`, the state LibreOffice last computed), and a
 * paragraph or span in a hidden text style. A hidden sheet is named so
 * instead, `(hidden)` after its name as a workbook's is, and a hidden slide's
 * position is returned for its marker, since both are still the author's.
 * Returns how many dropped elements held text.
 *
 * ponytail: a section or field hidden by a condition LibreOffice has not
 * evaluated into `is-hidden` stays, as do hidden rows and columns.
 */
export function withoutHiddenOdf(
  xml: string,
  styles: OdfHiddenStyles,
): { xml: string; hidden: number; slides: Set<number> } {
  const open: { name: string; start: number; drop: boolean }[] = [];
  // Where in `open` each paragraph or heading still open sits, innermost last.
  const paragraphs: number[] = [];
  const cuts: [number, number][] = [];
  const renames: [number, number, string][] = [];
  const slides = new Set<number>();
  let pages = 0;
  for (let at = xml.indexOf("<"); at >= 0; ) {
    const end = xml.indexOf(">", at);
    if (end < 0) break;
    const tag = xml.slice(at, end + 1);
    const next = xml.indexOf("<", end + 1);
    if (tag[1] === "?" || tag[1] === "!") {
      at = next;
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag.slice(closing ? 2 : 1).match(/^[^\s/>]+/)?.[0] ?? "";
    if (closing) {
      if (open[open.length - 1]?.name === name) {
        const element = open.pop()!;
        if (paragraphs[paragraphs.length - 1] === open.length) paragraphs.pop();
        if (element.drop) {
          // Whatever was cut inside it goes with it.
          while (cuts.length && cuts[cuts.length - 1][0] >= element.start) cuts.pop();
          cuts.push([element.start, end + 1]);
        }
      }
    } else {
      const style = ELEMENT_STYLE.exec(tag)?.[1];
      if (name === "text:hidden-paragraph" && /\stext:is-hidden="true"/.test(tag)) {
        if (paragraphs.length) open[paragraphs[paragraphs.length - 1]].drop = true;
      } else if (name === "table:table" && style && styles.table.has(style)) {
        const sheet = SHEET_NAME.exec(tag);
        if (sheet) renames.push([at + sheet.index, at + sheet.index + sheet[0].length, ` table:name="${sheet[1]} (hidden)"`]);
      } else if (name === "draw:page") {
        pages++;
        if (style && styles.page.has(style)) slides.add(pages);
      }
      if (!tag.endsWith("/>")) {
        const drop =
          // A section, or a variable or user field, set not to display.
          (name.startsWith("text:") && /\stext:display="none"/.test(tag)) ||
          ((name === "text:p" || name === "text:h" || name === "text:span") && !!style && styles.text.has(style));
        if (name === "text:p" || name === "text:h") paragraphs.push(open.length);
        open.push({ name, start: at, drop });
      }
    }
    at = next;
  }
  if (cuts.length === 0 && renames.length === 0) return { xml, hidden: 0, slides };
  // Both lists ascend: a cut is pushed when its element closes, after
  // everything inside it, and cuts inside it were taken back.
  const edits = [...cuts.map(([from, to]) => ({ from, to, text: "" })), ...renames.map(([from, to, text]) => ({ from, to, text }))];
  edits.sort((a, b) => a.from - b.from);
  const out: string[] = [];
  let kept = 0;
  for (const edit of edits) {
    // A sheet inside a dropped section is gone with it.
    if (edit.from < kept) continue;
    out.push(xml.slice(kept, edit.from), edit.text);
    kept = edit.to;
  }
  out.push(xml.slice(kept));
  return { xml: out.join(""), hidden: cuts.filter(([from, to]) => hasText(xml, from, to)).length, slides };
}

/**
 * A docx, pptx, OpenDocument or RTF file with its hidden text taken out, how
 * many hidden runs, elements or merged-away cells held text, and which slides
 * are hidden. Anything
 * else, or a file with nothing hidden, comes back as the same bytes.
 */
export function withoutHiddenText(bytes: Uint8Array): { bytes: Uint8Array; hidden: number; slides: Set<number> } {
  const none = { bytes, hidden: 0, slides: new Set<number>() };
  if (strFromU8(bytes.subarray(0, 5), true) === "{\\rtf") {
    // Pictures' alternative text, which both RTF readers skip (Q31 O1),
    // written first so a hidden picture's goes with the rest of its text.
    return { ...withoutHiddenRtf(withRtfAltText(bytes)), slides: none.slides };
  }
  let parts: Record<string, Uint8Array>;
  let unpacked = 0;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        unpacked += file.originalSize;
        return WORD_PART.test(file.name) || SLIDE_PART.test(file.name) || file.name === "content.xml" || file.name === "styles.xml";
      },
    });
  } catch {
    return none;
  }
  if (unpacked > MAX_REWRITE) return none;
  const changed: Record<string, Uint8Array> = {};
  let hidden = 0;
  let slides = new Set<number>();
  if (parts["content.xml"]) {
    const content = strFromU8(parts["content.xml"]);
    const styles: OdfHiddenStyles = { text: new Set(), table: new Set(), page: new Set() };
    collectHiddenStyles(content, styles);
    if (parts["styles.xml"]) collectHiddenStyles(strFromU8(parts["styles.xml"]), styles);
    const after = withoutHiddenOdf(content, styles);
    // A text document's list items get the labels its lists print (C8).
    if (content.includes("<office:text")) after.xml = withOdfListLabels(after.xml, parts["styles.xml"] ? strFromU8(parts["styles.xml"]) : "");
    // Frames' and tables' alternative text, where officeparser reads it (Q31 O1).
    after.xml = withOdfAltText(after.xml);
    // A form field's value where the text places it.
    after.xml = withOdfFormValues(after.xml);
    if (after.xml !== content) changed["content.xml"] = strToU8(after.xml);
    hidden = after.hidden;
    slides = after.slides;
  } else {
    for (const [name, data] of Object.entries(parts)) {
      if (SLIDE_PART.test(name)) {
        const before = strFromU8(data);
        const after = withoutMergedCells(before);
        if (after.xml !== before) changed[name] = strToU8(after.xml);
        hidden += after.hidden;
        continue;
      }
      if (!WORD_PART.test(name)) continue;
      const before = strFromU8(data);
      const after = withoutHiddenRuns(before);
      // An absolute-position tab ("Left<ptab>Right" in a header) is a tab to
      // the reader, as POI's XWPFRun reads it; officeparser drops it, "LeftRight".
      // Symbol characters and non-breaking hyphens, which it drops too.
      // Pictures' and tables' alternative text, which officeparser drops (Q31 O1),
      // and a HYPERLINK field's address, which it drops with the field code (Q32 O1).
      // A form check box's state and a drop-down's choice, which it never had.
      // A paragraph whose mark is a tracked deletion joins the next one.
      after.xml = withWordFormFields(withWordFieldLinks(withWordAltText(withRubyText(withWordSymbols(withDeletedMarksJoined(after.xml)).replace(/<w:ptab\b[^>]*?(?:\/>|>\s*<\/w:ptab>)/g, "<w:tab/>")))));
      if (after.xml === before) continue;
      changed[name] = strToU8(after.xml);
      hidden += after.hidden;
    }
  }
  if (Object.keys(changed).length === 0) return { ...none, slides };
  // Stored, not deflated: the zip is only read back by the next step.
  return { bytes: zipSync({ ...unzipSync(bytes), ...changed }, { level: 0 }), hidden, slides };
}

/**
 * An EPUB with each spine item marked `linear="no"` (EPUB 3.3 5.6.2,
 * auxiliary content) between a line that says so and a line that ends it.
 * officeparser writes the spine in order, the item inline and unmarked as
 * calibre's text output does; pandoc drops it and epub.js steps over it
 * to the next item. The text stays, as hidden text does (Q18 O1), and the marks say it
 * sits outside the reading order.
 *
 * Two package documents officeparser reads as an empty book are rewritten into
 * a shape it reads: elements written with a prefix (`<opf:package>`, calibre's
 * `<ns0:package>`), which an XML reader such as calibre's or epub.js's takes as
 * the same elements, and an XHTML item whose href has no extension, copied to
 * one ending `.xhtml`. Anything else comes back as the same bytes.
 */
export function withAuxiliaryMarked(bytes: Uint8Array): Uint8Array {
  let parts: Record<string, Uint8Array>;
  let unpacked = 0;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        unpacked += file.originalSize;
        return file.name === "META-INF/container.xml" || /\.opf$/i.test(file.name);
      },
    });
  } catch {
    return bytes;
  }
  const container = parts["META-INF/container.xml"];
  if (!container || unpacked > MAX_REWRITE) return bytes;
  const root = Array.from(tagsOf(strFromU8(container))).find((t) => t.local === "rootfile" && t.opens);
  const opf = decodeXml((root && attr(root.tag, "full-path")) ?? "");
  if (!parts[opf]) return bytes;
  const changed: Record<string, Uint8Array> = {};
  const box = unprefixed(strFromU8(container), "container");
  if (box !== strFromU8(container)) changed["META-INF/container.xml"] = strToU8(box);
  const base = opf.slice(0, opf.lastIndexOf("/") + 1);
  const hrefs = new Map<string, string>();
  const auxiliary: string[] = [];
  /** XHTML items whose href has no extension, by the href as written. */
  const bare = new Map<string, string>();
  const original = strFromU8(parts[opf]);
  for (const t of tagsOf(original)) {
    if (!t.opens) continue;
    if (t.local === "item") {
      const href = decodeXml(attr(t.tag, "href") ?? "");
      hrefs.set(attr(t.tag, "id") ?? "", href);
      if (attr(t.tag, "media-type") === "application/xhtml+xml" && /^[^.#?]+$/.test(href.split("/").pop() ?? ""))
        bare.set(attr(t.tag, "href") ?? "", href);
    } else if (t.local === "itemref" && attr(t.tag, "linear") === "no") auxiliary.push(attr(t.tag, "idref") ?? "");
  }
  let pkg = unprefixed(original, "package");
  if (bare.size) {
    const named = new Set(Array.from(bare.values(), (href) => base + href));
    for (const [name, data] of Object.entries(unzipSync(bytes, { filter: (file) => named.has(file.name) }))) changed[`${name}.xhtml`] = data;
    for (const [written, href] of bare)
      if (changed[`${base}${href}.xhtml`]) pkg = pkg.split(`href="${written}"`).join(`href="${written}.xhtml"`).split(`href='${written}'`).join(`href='${written}.xhtml'`);
  }
  if (pkg !== original) changed[opf] = strToU8(pkg);
  const files = new Set<string>();
  for (const id of auxiliary) {
    const href = hrefs.get(id)?.split("#")[0];
    if (!href) continue;
    try {
      files.add(base + decodeURIComponent(href));
    } catch {
      files.add(base + href);
    }
  }
  for (const [name, data] of Object.entries(files.size ? unzipSync(bytes, { filter: (file) => files.has(file.name) }) : {})) {
    const xml = strFromU8(data);
    const open = Array.from(tagsOf(xml)).find((t) => t.local === "body" && t.opens && !t.closes);
    const close = xml.lastIndexOf("</body>");
    if (!open || close < open.to) continue;
    changed[name] = strToU8(
      `${xml.slice(0, open.to)}<p>[Auxiliary content, outside the reading order]</p>${xml.slice(open.to, close)}<p>[End of auxiliary content]</p>${xml.slice(close)}`,
    );
  }
  if (!Object.keys(changed).length) return bytes;
  return zipSync({ ...unzipSync(bytes), ...changed }, { level: 0 });
}

/**
 * An XML part whose root element `<p:root>` binds its own prefix, with that
 * prefix taken off every element and declared as the default namespace instead.
 * The prefix's declaration stays, for attributes such as `opf:role`.
 */
function unprefixed(xml: string, root: string): string {
  const prefixed = new RegExp(`<([\\w-]+):${root}\\b([^>]*)>`).exec(xml);
  const uri = prefixed && new RegExp(`\\sxmlns:${prefixed[1]}\\s*=\\s*["']([^"']+)`).exec(prefixed[2])?.[1];
  if (!prefixed || !uri || /\sxmlns\s*=/.test(prefixed[2])) return xml;
  return xml.replace(new RegExp(`(</?)${prefixed[1]}:`, "g"), "$1").replace(new RegExp(`<${root}\\b`), `<${root} xmlns="${uri}"`);
}
