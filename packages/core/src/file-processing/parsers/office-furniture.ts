import { strFromU8 } from "fflate";
import {
  attr,
  cellName,
  decodeXml,
  fold,
  hiddenLabel,
  relationships,
  sheetHeaderText,
  tagsOf,
  text,
  unpack,
  validationLabel,
  within,
  type ChartBlock,
} from "./office-charts";

/** The lines of a document's page headers and footers, a paragraph each. */
export interface PageFurniture {
  headers: string[];
  footers: string[];
}

const ODF_REGION = /^style:(header|footer)(?:-left|-first)?$/;
const ODF_PARAGRAPH = new Set(["text:p", "text:h"]);
const ODF_SPACE = new Set(["text:s", "text:tab", "text:line-break"]);

/**
 * Every header and footer an OpenDocument text file prints (C7): the default,
 * first-page and left-page ones of the default master page and of each master
 * page a style names. officeparser reads the first master page's default pair
 * alone, so a cover page's header or an even page's footer was lost. A region
 * the author switched off (`style:display="false"`) is left out, and a field
 * reads as the text the file caches for it.
 */
export function odfPageFurniture(bytes: Uint8Array): PageFurniture {
  const found: PageFurniture = { headers: [], footers: [] };
  const parts = unpack(bytes, (name) => name === "styles.xml" || name === "content.xml");
  const styles = text(parts?.["styles.xml"]);
  if (!styles.includes("style:master-page")) return found;
  const used = new Set<string>();
  for (const xml of [styles, text(parts?.["content.xml"])]) {
    for (const t of tagsOf(xml)) {
      const name = t.opens ? attr(t.tag, "style:master-page-name") : undefined;
      if (name) used.add(decodeXml(name));
    }
  }
  let first = true;
  let taken = false;
  let region: string[] | undefined;
  let line: string | undefined;
  let after = 0;
  for (const t of tagsOf(styles)) {
    if (line !== undefined) line += decodeXml(styles.slice(after, t.from));
    after = t.to;
    if (t.name === "style:master-page" && t.opens) {
      taken = first || used.has(decodeXml(attr(t.tag, "style:name") ?? ""));
      first = false;
    } else if (ODF_REGION.test(t.name)) {
      if (!t.opens) region = undefined;
      else if (!t.closes && taken && attr(t.tag, "style:display") !== "false") {
        region = t.name.startsWith("style:header") ? found.headers : found.footers;
      }
    } else if (region && ODF_PARAGRAPH.has(t.name)) {
      if (t.opens && !t.closes) line ??= "";
      else if (!t.opens && line !== undefined) {
        if (fold(line)) region.push(fold(line));
        line = undefined;
      }
    } else if (line !== undefined && ODF_SPACE.has(t.name) && t.opens) line += " ";
  }
  return found;
}

/** BIFF record types (MS-XLS 2.3). */
const BIFF_BOF = 0x0809;
const BIFF_EOF = 0x000a;
const BIFF_FILEPASS = 0x002f;
const BIFF_BOUNDSHEET = 0x0085;
const BIFF_HEADER = 0x0014;
const BIFF_FOOTER = 0x0015;
const BIFF_DV = 0x01be;
const BIFF_DIMENSIONS = 0x0200;
const BIFF_ROW = 0x0208;
const BIFF_COLINFO = 0x007d;

/**
 * An Excel 97-2003 or 5/95 workbook's print headers and footers by sheet
 * name, from its `Workbook` or `Book` stream: the Header and Footer records
 * each sheet carries (MS-XLS 2.4.136), labelled as an xlsx's are (Q27 O1),
 * its data validation rules (Dv, 2.4.95), and the rows (Row fDyZero, 2.4.221)
 * and columns (ColInfo fHidden, 2.4.53) it hides inside its used range
 * (Dimensions, 2.4.90), as an xlsx's are (Q34 O1). SheetJS keeps nothing of
 * the first two, and a hidden column only with cell styles on. An encrypted
 * stream gives nothing.
 *
 * ponytail: the odd-page pair only; the even and first-page ones in a
 * HeaderFooter record (2.4.137) are left out. A BIFF5 name is read as
 * Latin-1, whatever its code page.
 */
export function biffSheetFurniture(stream: Uint8Array): Map<string, ChartBlock[]> {
  const found = new Map<string, ChartBlock[]>();
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const utf16 = new TextDecoder("utf-16le");
  function* records(from: number, to: number) {
    for (let at = from; at + 4 <= to; ) {
      const size = view.getUint16(at + 2, true);
      if (at + 4 + size > to) return;
      yield { type: view.getUint16(at, true), data: at + 4, size };
      at += 4 + size;
    }
  }
  let biff8 = false;
  // A string inside a record: BIFF8 a 1- or 2-byte count and a flags byte
  // whose low bit says UTF-16, BIFF5 a 1-byte count and 8-bit text.
  const read = (at: number, size: number, wide: boolean): string => {
    const head = biff8 ? (wide ? 3 : 2) : 1;
    if (size < head) return "";
    const count = biff8 && wide ? view.getUint16(at, true) : view.getUint8(at);
    const high = biff8 && (view.getUint8(at + head - 1) & 1) === 1;
    const bytes = stream.subarray(at + head, Math.min(at + size, at + head + count * (high ? 2 : 1)));
    return high ? utf16.decode(bytes) : strFromU8(bytes, true);
  };
  /**
   * A Dv record: flags, the prompt and error titles and texts, two formulas,
   * then the ranges it covers. A title or text Excel leaves unset is one NUL.
   */
  const biffValidation = (from: number, to: number): string | undefined => {
    if (to - from < 4) return undefined;
    const flags = view.getUint32(from, true);
    let at = from + 4;
    const strings: string[] = [];
    for (let i = 0; i < 4; i++) {
      if (at + 3 > to) return undefined;
      const count = view.getUint16(at, true);
      strings.push(read(at, to - at, true).split("\0").join(""));
      at += 3 + count * (view.getUint8(at + 2) & 1 ? 2 : 1);
    }
    const [promptTitle, errorTitle, prompt, error] = strings;
    // An explicit list is formula 1 as one string token (ptgStr), values apart by NUL.
    let allowed: string | undefined;
    if (at + 6 <= to && (flags & 0x0f) === 3 && flags & 0x80 && view.getUint8(at + 4) === 0x17) {
      allowed = read(at + 5, Math.min(to, at + 4 + view.getUint16(at, true)) - at - 5, false)
        .split("\0")
        .filter(Boolean)
        .join(", ");
    }
    for (let i = 0; i < 2 && at + 4 <= to; i++) at += 4 + view.getUint16(at, true);
    const ranges: string[] = [];
    for (let i = 0, count = at + 2 <= to ? view.getUint16(at, true) : 0; i < count && at + 10 + i * 8 <= to; i++) {
      const ref = at + 2 + i * 8;
      const first = cellName(view.getUint16(ref, true), view.getUint16(ref + 4, true));
      const last = cellName(view.getUint16(ref + 2, true), view.getUint16(ref + 6, true));
      ranges.push(first === last ? first : `${first}:${last}`);
    }
    return validationLabel(ranges.join(" "), {
      ...(flags & 0x40000 ? { promptTitle, prompt } : {}),
      ...(allowed ? { allowed } : {}),
      ...(flags & 0x80000 ? { errorTitle, error } : {}),
    });
  };
  const sheets: { at: number; name: string }[] = [];
  for (const r of records(0, stream.byteLength)) {
    if (r.type === BIFF_BOF && r.size >= 2 && sheets.length === 0) biff8 = view.getUint16(r.data, true) === 0x0600;
    else if (r.type === BIFF_FILEPASS) return found;
    else if (r.type === BIFF_BOUNDSHEET && r.size > 6) sheets.push({ at: view.getUint32(r.data, true), name: read(r.data + 6, r.size - 6, false) });
    else if (r.type === BIFF_EOF) break;
  }
  // Each sheet's records are read up to the next sheet's start, once however
  // many names point at it, so a forged table cannot read the stream again per sheet.
  const starts = [...new Set(sheets.map((sheet) => sheet.at))].sort((a, b) => a - b);
  const seen = new Set<string>();
  const byStart = new Map<number, ChartBlock[]>();
  starts.forEach((start, index) => {
    const blocks: ChartBlock[] = [];
    const rows: [number, number][] = [];
    const cols: [number, number][] = [];
    let end: { row: number; col: number } | undefined;
    let depth = 0;
    for (const r of records(start, starts[index + 1] ?? stream.byteLength)) {
      // A chart drawn on the sheet is a substream of its own, BOF to EOF.
      if (r.type === BIFF_BOF) depth++;
      else if (r.type === BIFF_EOF && --depth <= 0) break;
      else if (depth === 1 && (r.type === BIFF_HEADER || r.type === BIFF_FOOTER)) {
        const line = sheetHeaderText(read(r.data, r.size, true));
        const label = `[Page ${r.type === BIFF_HEADER ? "header" : "footer"}: ${line}]`;
        if (line && !seen.has(label)) {
          seen.add(label);
          blocks.push({ label, rows: [] });
        }
      } else if (depth === 1 && biff8 && r.type === BIFF_DV) {
        const label = biffValidation(r.data, r.data + r.size);
        if (label) blocks.push({ label, rows: [] });
      } else if (depth === 1 && r.type === BIFF_DIMENSIONS && r.size >= (biff8 ? 12 : 8)) {
        // The row and column past the last used one; BIFF8 counts rows in 32 bits.
        const wide = biff8 ? 4 : 2;
        const row = wide === 4 ? view.getUint32(r.data + 4, true) : view.getUint16(r.data + 2, true);
        end = { row: row - 1, col: view.getUint16(r.data + 2 * wide + 2, true) - 1 };
      } else if (depth === 1 && r.type === BIFF_ROW && r.size >= 13 && view.getUint8(r.data + 12) & 0x20) {
        const row = view.getUint16(r.data, true);
        rows.push([row, row]);
      } else if (depth === 1 && r.type === BIFF_COLINFO && r.size >= 10 && view.getUint16(r.data + 8, true) & 1) {
        cols.push([view.getUint16(r.data, true), view.getUint16(r.data + 2, true)]);
      }
    }
    const hidden = hiddenLabel(end ? within(rows, end.row) : rows, end ? within(cols, end.col) : cols);
    if (hidden) blocks.unshift({ label: hidden, rows: [] });
    byStart.set(start, blocks);
  });
  for (const sheet of sheets) {
    const blocks = byStart.get(sheet.at);
    byStart.delete(sheet.at);
    if (blocks?.length && !found.has(sheet.name)) found.set(sheet.name, blocks);
  }
  return found;
}

const ODF_FIELD = new Set([
  "text:page-number",
  "text:page-count",
  "text:date",
  "text:time",
  "text:sheet-name",
  "text:file-name",
  "text:title",
  "text:chapter",
  "presentation:header",
  "presentation:footer",
  "presentation:date-time",
]);
const ODF_SECTION: Record<string, string> = { "style:region-left": "L", "style:region-center": "C", "style:region-right": "R" };

/**
 * An OpenDocument spreadsheet's print headers and footers by sheet name, as
 * `[Page header: left | center | right]` lines like an xlsx's (Q27 O1), each
 * written once across the workbook. A sheet prints its table style's master
 * page, else the first one. Fields go: the file caches `???` for a sheet name
 * and `1` for every page number, which is why officeparser skips these.
 */
export function odsSheetFurniture(bytes: Uint8Array): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const parts = unpack(bytes, (name) => name === "styles.xml" || name === "content.xml");
  const styles = text(parts?.["styles.xml"]);
  if (!styles.includes("style:master-page")) return found;
  const masters = new Map<string, string[]>();
  let first: string | undefined;
  let lines: string[] = [];
  let kind = "";
  let sections: Record<string, string> = {};
  let section = "C";
  let field = 0;
  let after = 0;
  for (const t of tagsOf(styles)) {
    if (kind && field === 0) sections[section] += decodeXml(styles.slice(after, t.from));
    after = t.to;
    if (t.name === "style:master-page" && t.opens) {
      const name = decodeXml(attr(t.tag, "style:name") ?? "");
      lines = [];
      if (!masters.has(name)) masters.set(name, lines);
      first ??= name;
    } else if (ODF_REGION.test(t.name)) {
      if (t.opens && !t.closes && attr(t.tag, "style:display") !== "false") {
        kind = t.name.startsWith("style:header") ? "header" : "footer";
        sections = { L: "", C: "", R: "" };
        section = "C";
      } else if (!t.opens && kind) {
        const line = ["L", "C", "R"]
          .map((key) => fold(sections[key]))
          .filter(Boolean)
          .join(" | ");
        if (line) lines.push(`[Page ${kind}: ${line}]`);
        kind = "";
      }
    } else if (kind && t.opens && ODF_SECTION[t.name]) section = ODF_SECTION[t.name];
    else if (ODF_FIELD.has(t.name)) {
      if (!t.closes) field++;
      else if (!t.opens) field = Math.max(0, field - 1);
    } else if (kind && (ODF_SPACE.has(t.name) || (!t.opens && ODF_PARAGRAPH.has(t.name)))) sections[section] += " ";
  }
  const content = text(parts?.["content.xml"]);
  const masterOf = new Map<string, string>();
  const written = new Set<string>();
  for (const t of tagsOf(content)) {
    if (!t.opens) continue;
    if (t.name === "style:style" && attr(t.tag, "style:family") === "table") {
      masterOf.set(decodeXml(attr(t.tag, "style:name") ?? ""), decodeXml(attr(t.tag, "style:master-page-name") ?? ""));
    } else if (t.name === "table:table") {
      const name = decodeXml(attr(t.tag, "table:name") ?? "");
      const master = masterOf.get(decodeXml(attr(t.tag, "table:style-name") ?? "")) || first || "";
      const own = (masters.get(master) ?? []).filter((line) => !written.has(line) && !!written.add(line));
      if (own.length && !found.has(name)) found.set(name, own);
    }
  }
  return found;
}

/**
 * An OpenDocument spreadsheet's validation rules as `[Validation: ...]` lines
 * (as an xlsx's are), under each sheet with a cell that uses one, once per
 * sheet: the help and error messages it shows (ODF 1.3 9.4.6, 9.4.7) and a
 * list rule's values. Cells are not addressed: repeated rows and columns make
 * a cell's address a count this pass does not keep.
 */
export function odsValidations(bytes: Uint8Array): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const content = text(unpack(bytes, (name) => name === "content.xml")?.["content.xml"]);
  if (!content.includes("table:content-validation")) return found;
  const rules = new Map<string, string>();
  let rule: { name: string; allowed?: string; parts: Record<string, string> } | undefined;
  let message = "";
  let body: string | undefined;
  let after = 0;
  let sheet = "";
  for (const t of tagsOf(content)) {
    if (body !== undefined) body += decodeXml(content.slice(after, t.from));
    after = t.to;
    if (t.name === "table:content-validation" && t.opens) {
      const list = /cell-content-is-in-list\(([\s\S]*)\)/.exec(decodeXml(attr(t.tag, "table:condition") ?? ""))?.[1];
      // `"a";"b"` is the list itself; a range reference is where it is read from.
      const values = list?.split(";").map((one) => one.trim());
      const allowed = values?.every((one) => /^"[\s\S]*"$/.test(one)) ? values.map((one) => one.slice(1, -1)).join(", ") : list && `values in ${list}`;
      rule = { name: decodeXml(attr(t.tag, "table:name") ?? ""), ...(allowed ? { allowed } : {}), parts: {} };
    }
    if (rule && (t.name === "table:help-message" || t.name === "table:error-message")) {
      if (t.opens && attr(t.tag, "table:display") !== "false") {
        message = t.name;
        rule.parts[`${t.name}:title`] = decodeXml(attr(t.tag, "table:title") ?? "");
        rule.parts[t.name] = "";
      }
      if (!t.opens || t.closes) message = "";
    } else if (message && t.name === "text:p") {
      if (t.opens && !t.closes) body = "";
      else if (!t.opens && body !== undefined) {
        rule!.parts[message] = `${rule!.parts[message]} ${body}`;
        body = undefined;
      }
    } else if (message && body !== undefined && ODF_SPACE.has(t.name) && t.opens) body += " ";
    if (rule && t.name === "table:content-validation" && t.closes) {
      const label = validationLabel("", {
        promptTitle: rule.parts["table:help-message:title"],
        prompt: rule.parts["table:help-message"],
        allowed: rule.allowed,
        errorTitle: rule.parts["table:error-message:title"],
        error: rule.parts["table:error-message"],
      });
      if (label) rules.set(rule.name, label);
      rule = undefined;
    }
    if (t.name === "table:table" && t.opens) sheet = decodeXml(attr(t.tag, "table:name") ?? "");
    const used = t.opens && t.name === "table:table-cell" ? rules.get(decodeXml(attr(t.tag, "table:content-validation-name") ?? "")) : undefined;
    if (used) {
      const lines = found.get(sheet) ?? [];
      if (!lines.includes(used)) found.set(sheet, [...lines, used]);
    }
  }
  return found;
}

/**
 * An OpenDocument spreadsheet's hidden rows and columns by sheet name, as an
 * xlsx's are (Q34 O1): `table:visibility` `collapse` or `filter` on a row or
 * a column (ODF 1.3 9.1.3, 9.1.6), inside the rows and columns its cells use.
 * A row or column repeated N times counts N, as the sheet draws it.
 */
export function odsHidden(bytes: Uint8Array): Map<string, string> {
  const found = new Map<string, string>();
  const content = text(unpack(bytes, (name) => name === "content.xml")?.["content.xml"]);
  if (!content.includes("table:visibility")) return found;
  const repeat = (tag: string, name: string) => Math.max(1, Number(attr(tag, name)) || 1);
  const shut = (tag: string) => /^(collapse|filter)$/.test(attr(tag, "table:visibility") ?? "");
  let sheet = "";
  let rows: [number, number][] = [];
  let cols: [number, number][] = [];
  let row = 0;
  let col = 0;
  let cell = 0;
  let span = 1;
  let rowHidden = false;
  let used = false;
  let last = { row: -1, col: -1 };
  for (const t of tagsOf(content)) {
    if (t.name === "table:table") {
      if (t.opens) {
        sheet = decodeXml(attr(t.tag, "table:name") ?? "");
        rows = [];
        cols = [];
        row = col = 0;
        last = { row: -1, col: -1 };
      } else {
        const label = hiddenLabel(within(rows, last.row), within(cols, last.col));
        if (label && !found.has(sheet)) found.set(sheet, label);
      }
    } else if (t.name === "table:table-column" && t.opens) {
      const n = repeat(t.tag, "table:number-columns-repeated");
      if (shut(t.tag)) cols.push([col, col + n - 1]);
      col += n;
    } else if (t.name === "table:table-row") {
      if (t.opens) {
        span = repeat(t.tag, "table:number-rows-repeated");
        rowHidden = shut(t.tag);
        used = false;
        cell = 0;
      }
      if (!t.opens || t.closes) {
        if (used) last.row = Math.max(last.row, row + span - 1);
        if (rowHidden) rows.push([row, row + span - 1]);
        row += span;
      }
    } else if ((t.name === "table:table-cell" || t.name === "table:covered-table-cell") && t.opens) {
      const n = repeat(t.tag, "table:number-columns-repeated");
      // A cell with a value or anything inside it is one the sheet uses.
      if (!t.closes || attr(t.tag, "office:value-type") !== undefined) {
        used = true;
        last.col = Math.max(last.col, cell + n - 1);
      }
      cell += n;
    }
  }
  return found;
}

/**
 * The lines a pptx shape tree prints, from shapes that are no placeholder:
 * a placeholder on a master or layout holds a prompt ("Click to add title")
 * the slide replaces. A field (the slide number) and a hidden shape go.
 */
function slideShapeText(xml: string): string[] {
  const out: string[] = [];
  let shape: string[] | undefined;
  let skip = false;
  let line: string | undefined;
  let field = false;
  let textFrom = 0;
  for (const t of tagsOf(xml)) {
    if (t.local === "sp") {
      if (t.opens && !t.closes) {
        shape = [];
        skip = false;
      } else if (!t.opens) {
        if (shape && !skip) out.push(...shape);
        shape = undefined;
      }
    } else if (!shape) continue;
    else if (t.local === "ph" && t.opens) skip = true;
    else if (t.local === "cNvPr" && t.opens && isHidden(t.tag)) skip = true;
    else if (t.local === "fld") field = t.opens && !t.closes;
    else if (t.local === "p" && t.name !== t.local) {
      if (t.opens && !t.closes) line = "";
      else if (!t.opens && line !== undefined) {
        if (fold(line)) shape.push(fold(line));
        line = undefined;
      }
    } else if (line !== undefined && t.local === "br") line += " ";
    else if (line !== undefined && t.local === "t" && !field) {
      if (t.opens) textFrom = t.to;
      else line += decodeXml(xml.slice(textFrom, t.from));
    }
  }
  return out;
}

const isHidden = (tag: string) => ["1", "true"].includes(attr(tag, "hidden") ?? "");

/** What a deck names over its slides, by the slide's position in the deck. */
export interface DeckLabels {
  /** The section that starts at a slide. */
  sections: Map<number, string>;
  /** A slide's own name. */
  names: Map<number, string>;
  /** Each custom show as a line naming its slides. */
  shows: string[];
}

/**
 * A deck's sections, slide names and custom shows, which officeparser reads
 * none of; no reading of them was found in docling, Tika or markitdown. A pptx keeps its
 * sections in PowerPoint 2010's `p14:sectionLst` and its custom shows in
 * `p:custShowLst` (ECMA-376 19.2.1.5), both after `p:sldIdLst`, whose order
 * numbers the slides as officeparser does. An OpenDocument deck names each
 * `draw:page` (ODF 1.3 10.2.4); LibreOffice's own `page<n>` is left out,
 * since no author typed it. Nothing for any other file.
 */
export function deckLabels(bytes: Uint8Array): DeckLabels {
  const found: DeckLabels = { sections: new Map(), names: new Map(), shows: [] };
  const parts = unpack(bytes, (name) => /^(?:ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|content\.xml)$/.test(name));
  if (!parts) return found;
  const presentation = parts["ppt/presentation.xml"];
  if (!presentation) {
    let page = 0;
    for (const t of tagsOf(text(parts["content.xml"]))) {
      if (t.name !== "draw:page" || !t.opens) continue;
      page++;
      const name = fold(decodeXml(attr(t.tag, "draw:name") ?? ""));
      if (name && !/^page\d+$/.test(name)) found.names.set(page, name);
    }
    return found;
  }
  const deck = relationships(parts, "ppt/presentation.xml");
  const byPart = new Map<string, number>();
  const byId = new Map<string, number>();
  let section: string | undefined;
  let show: { name: string; slides: number[] } | undefined;
  for (const t of tagsOf(text(presentation))) {
    const part = deck.get(attr(t.tag, "r:id") ?? "")?.part ?? "";
    if (t.name === "p:sldId" && t.opens) {
      if (!part || byPart.has(part)) continue;
      byPart.set(part, byPart.size + 1);
      byId.set(attr(t.tag, "id") ?? "", byPart.size);
    } else if (t.local === "section" && t.closes !== t.opens) {
      section = t.opens ? fold(decodeXml(attr(t.tag, "name") ?? "")) : undefined;
    } else if (t.local === "sldId" && t.opens && section) {
      // A section is named once, at its first slide.
      const at = byId.get(attr(t.tag, "id") ?? "");
      if (!at) continue;
      if (!found.sections.has(at)) found.sections.set(at, section);
      section = "";
    } else if (t.name === "p:custShow" && t.closes !== t.opens) {
      if (t.opens) show = { name: fold(decodeXml(attr(t.tag, "name") ?? "")), slides: [] };
      else if (show?.slides.length) found.shows.push(`[Custom show, ${show.name}: slides ${show.slides.join(", ")}]`);
    } else if (t.name === "p:sld" && t.opens && show && byPart.has(part)) {
      show.slides.push(byPart.get(part)!);
    }
  }
  return found;
}

/**
 * The text a deck's slide masters and layouts print on every slide that uses
 * them, such as a company line or a confidentiality mark (Q28 O1): read once,
 * each distinct line once, from the masters and layouts the slides use, in
 * deck order, a master before its layout. An OpenDocument deck's master pages
 * the same way, then the header, footer and date text its slides show.
 * Placeholders and fields are left out. Tika reads the same shapes and skips
 * placeholders too. Nothing for any other file.
 */
export function slideMasterText(bytes: Uint8Array): string[] {
  const parts = unpack(
    bytes,
    (name) =>
      /^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/_rels\/[^/]+\.rels|(?:slideLayouts|slideMasters)\/(?:_rels\/)?[^/]+\.xml(?:\.rels)?)$/.test(
        name,
      ) ||
      name === "styles.xml" ||
      name === "content.xml",
  );
  const lines = new Set<string>();
  if (!parts) return [];
  if (parts["ppt/presentation.xml"]) {
    const deck = relationships(parts, "ppt/presentation.xml");
    const read = new Set<string>();
    const target = (part: string, type: string) => [...relationships(parts, part).values()].find((rel) => rel.type.endsWith(type))?.part;
    for (const t of tagsOf(text(parts["ppt/presentation.xml"]))) {
      if (!t.opens || t.local !== "sldId") continue;
      const slide = deck.get(attr(t.tag, "r:id") ?? "")?.part;
      const layout = slide && target(slide, "/slideLayout");
      if (!layout || read.has(layout)) continue;
      read.add(layout);
      const master = target(layout, "/slideMaster");
      for (const part of [master, layout]) {
        if (!part || (part === master && read.has(part))) continue;
        read.add(part);
        for (const line of slideShapeText(text(parts[part]))) lines.add(line);
      }
    }
    return [...lines];
  }
  const content = text(parts["content.xml"]);
  if (!content.includes("draw:page")) return [];
  const used = new Set<string>();
  const shown: string[] = [];
  const decls = new Map<string, string>();
  let decl: string | undefined;
  let declText = "";
  let after = 0;
  for (const t of tagsOf(content)) {
    if (decl !== undefined) declText += content.slice(after, t.from);
    after = t.to;
    if (t.name === "draw:page" && t.opens) {
      used.add(decodeXml(attr(t.tag, "draw:master-page-name") ?? ""));
      for (const kind of ["header", "footer", "date-time"]) {
        const name = attr(t.tag, `presentation:use-${kind}-name`);
        if (name) shown.push(`${kind}:${decodeXml(name)}`);
      }
    } else if (/^presentation:(?:header|footer|date-time)-decl$/.test(t.name)) {
      if (t.opens && !t.closes) {
        decl = `${t.local.replace(/-decl$/, "")}:${decodeXml(attr(t.tag, "presentation:name") ?? "")}`;
        declText = "";
      } else if (!t.opens && decl !== undefined) {
        decls.set(decl, fold(decodeXml(declText)));
        decl = undefined;
      }
    }
  }
  const styles = text(parts["styles.xml"]);
  let take = false;
  let depth = 0;
  let skipAt = -1;
  let field = 0;
  let line: string | undefined;
  after = 0;
  for (const t of tagsOf(styles)) {
    if (line !== undefined && field === 0) line += decodeXml(styles.slice(after, t.from));
    after = t.to;
    if (t.name === "style:master-page") {
      take = t.opens && !t.closes && used.has(decodeXml(attr(t.tag, "style:name") ?? ""));
      continue;
    }
    if (!take) continue;
    // A placeholder (`presentation:class`) and the notes page are skipped whole.
    if (t.opens && !t.closes) {
      depth++;
      if (skipAt < 0 && (t.name === "presentation:notes" || attr(t.tag, "presentation:class") !== undefined)) skipAt = depth;
    } else if (!t.opens) {
      if (depth === skipAt) skipAt = -1;
      depth--;
    }
    if (skipAt >= 0) continue;
    if (ODF_PARAGRAPH.has(t.name)) {
      if (t.opens && !t.closes) line = "";
      else if (!t.opens && line !== undefined) {
        if (fold(line)) lines.add(fold(line));
        line = undefined;
      }
    } else if (ODF_FIELD.has(t.name)) {
      if (!t.closes) field++;
      else if (!t.opens) field = Math.max(0, field - 1);
    } else if (line !== undefined && ODF_SPACE.has(t.name) && t.opens) line += " ";
  }
  for (const name of shown) if (decls.get(name)) lines.add(decls.get(name)!);
  return [...lines];
}
