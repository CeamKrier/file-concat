import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { altLabel } from "./alt-text";

/**
 * Charts read from their own XML, so their text reaches the bundle where the
 * chart sits (C6). officeparser 8.1.1 fills a chart only when it also extracts
 * every image, never reads a docx chart, and gives a worksheet's chart no node;
 * SheetJS keeps nothing of a chart.
 *
 * A chart becomes a label line, `[Chart, bar: title]`, and a table of its data:
 * categories down, one column per series, the category axis title in the
 * corner, as docling files a chart; markitdown writes the same grid under a
 * `Chart:` heading. Values are the cached text the file holds, unformatted; a
 * custom data label follows its value in brackets.
 *
 * ponytail: the classic chart part only. A chartex part (waterfall, treemap,
 * sunburst since Office 2016) and the text boxes drawn on a chart are left
 * out; read `cx:` parts the same way if files carry them.
 */
export interface ChartBlock {
  label: string;
  rows: string[][];
}

/**
 * Past this many bytes unpacked the package is read without its charts: these
 * readers unpack parts officeparser may never open.
 */
const MAX_UNPACKED = 256 * 1024 * 1024;

export function decodeXml(text: string): string {
  return text.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (entity, hex, dec, name: string) => {
    if (name) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name.toLowerCase()]!;
    const code = parseInt(hex ?? dec, hex ? 16 : 10);
    // Past U+10FFFF fromCodePoint throws, and one bad entity must not fail the file.
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

export const fold = (text: string) => text.replace(/\s+/g, " ").trim();

export interface Tag {
  /** The qualified name, `c:pt`. */
  name: string;
  /** The name without its prefix, `pt`. */
  local: string;
  tag: string;
  from: number;
  to: number;
  opens: boolean;
  closes: boolean;
}

/** Each tag of a part in order, found by index, so a crafted part cannot make the scan quadratic. */
export function* tagsOf(xml: string): Generator<Tag> {
  for (let at = xml.indexOf("<"); at >= 0; ) {
    const end = xml.indexOf(">", at);
    if (end < 0) return;
    const tag = xml.slice(at, end + 1);
    if (tag[1] !== "?" && tag[1] !== "!") {
      const name = /^<\/?([^\s/>]+)/.exec(tag)?.[1] ?? "";
      const opens = tag[1] !== "/";
      yield { name, local: name.slice(name.indexOf(":") + 1), tag, from: at, to: end + 1, opens, closes: !opens || tag.endsWith("/>") };
    }
    at = xml.indexOf("<", end + 1);
  }
}

export const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const index = (tag: string, name: string) => parseInt(attr(tag, name) ?? "", 10) || 0;

/** `[Chart, bar: title; subtitle; alt; values: value axis title]`, each part only when there is one. */
function labelOf(kinds: string[], parts: string[], values: string[]): string {
  const kind = [...new Set(kinds.filter(Boolean))].join(", ");
  const head = parts.map(fold).filter((part, at, all) => part && all.indexOf(part) === at).join("; ");
  const axes = values.map(fold).filter(Boolean).map((title) => `; values: ${title}`).join("");
  return `[Chart${kind ? `, ${kind}` : ""}${head ? `: ${head}` : ""}${axes}]`;
}

interface Series {
  name: string;
  categories: Map<number, string>;
  values: Map<number, string>;
  labels: Map<number, string>;
}

/** Where a DrawingML text run belongs, set by the element it sits in. */
type Area = "none" | "skip" | "title" | "axis" | "name" | "category" | "value" | "label";

const AXES = new Set(["catAx", "dateAx", "serAx", "valAx"]);

/** A DrawingML chart part (`c:chartSpace`) as a label and its data, or nothing if it is not one. */
export function drawingChart(xml: string, alt = ""): ChartBlock | undefined {
  if (!xml.includes("chartSpace")) return undefined;
  const frames: { local: string; area: Area }[] = [];
  const kinds: string[] = [];
  const axes: { kind: string; title: string }[] = [];
  const series: Series[] = [];
  let title = "";
  let point = 0;
  let labelAt = 0;
  let textFrom = 0;
  const put = (area: Area, text: string) => {
    const last = series[series.length - 1];
    if (area === "title") title += text;
    else if (area === "axis" && axes.length) axes[axes.length - 1].title += text;
    else if (!last) return;
    else if (area === "name") last.name += text;
    else if (area === "value") last.values.set(point, text);
    else if (area === "label") last.labels.set(labelAt, (last.labels.get(labelAt) ?? "") + text);
    else if (area === "category") {
      // A multi-level category has a run per level; the first is the innermost.
      const before = last.categories.get(point);
      last.categories.set(point, before ? `${before} / ${text}` : text);
    }
  };
  for (const t of tagsOf(xml)) {
    const parent = frames[frames.length - 1] ?? { local: "", area: "none" as Area };
    if (t.opens) {
      if (parent.local === "plotArea" && t.local.endsWith("Chart")) kinds.push(t.local.slice(0, -5));
      else if (parent.local === "plotArea" && AXES.has(t.local)) axes.push({ kind: t.local, title: "" });
      else if (t.local === "ser" && parent.local.endsWith("Chart")) {
        series.push({ name: "", categories: new Map(), values: new Map(), labels: new Map() });
      } else if (t.local === "pt") point = index(t.tag, "idx");
      else if (t.local === "idx" && parent.local === "dLbl") labelAt = index(t.tag, "val");
      if (t.closes) continue;
      let area = parent.area;
      if (area === "skip" || t.local === "extLst") area = "skip";
      else if (t.local === "title") area = parent.local === "chart" ? "title" : AXES.has(parent.local) ? "axis" : area;
      else if (parent.local === "ser" && t.local === "tx") area = "name";
      else if (parent.local === "ser" && (t.local === "cat" || t.local === "xVal")) area = "category";
      else if (parent.local === "ser" && (t.local === "val" || t.local === "yVal")) area = "value";
      else if (parent.local === "dLbl" && t.local === "tx") area = "label";
      frames.push({ local: t.local, area });
      textFrom = t.to;
      continue;
    }
    if ((t.local === "v" || t.local === "t") && parent.local === t.local) put(parent.area, decodeXml(xml.slice(textFrom, t.from)));
    else if (t.local === "p") put(parent.area, " ");
    frames.pop();
  }

  // The axis the categories run along; a scatter chart's x axis is a value axis, its first.
  const across =
    axes.find((axis) => axis.kind === "catAx" || axis.kind === "dateAx") ??
    (kinds.some((kind) => kind === "scatter" || kind === "bubble") ? axes[0] : undefined);
  const label = labelOf(kinds, [title, alt], axes.filter((axis) => axis !== across).map((axis) => axis.title));
  if (!series.length) return { label, rows: [] };
  const categories = series.find((one) => one.categories.size)?.categories ?? new Map<number, string>();
  const all = [...new Set([...categories.keys(), ...series.flatMap((one) => [...one.values.keys()])])].sort((a, b) => a - b);
  // Series that each number their points apart would multiply into a grid
  // far larger than the part; past the cap the rest is named, not written.
  const points = all.slice(0, Math.floor(MAX_CELLS / (series.length + 1)));
  const rows = [
    [fold(across?.title ?? "") || "Category", ...series.map((one, at) => fold(one.name) || `Series ${at + 1}`)],
    ...points.map((at) => [
      fold(categories.get(at) ?? ""),
      ...series.map((one) => {
        const value = fold(one.values.get(at) ?? "");
        const custom = fold(one.labels.get(at) ?? "");
        return custom && custom !== value ? (value ? `${value} (${custom})` : custom) : value;
      }),
    ]),
    ...(all.length > points.length ? [[`(${all.length - points.length} more points left out)`]] : []),
  ];
  return { label, rows };
}

/** The most cells a chart's table is written with. */
const MAX_CELLS = 100_000;

/**
 * An OpenDocument chart object (`Object N/content.xml`) as a label and its
 * data. The object carries the data as its own table, header row first, so
 * that table is the grid.
 */
export function odfChart(xml: string, alt = ""): ChartBlock | undefined {
  if (!xml.includes("<chart:chart")) return undefined;
  // `area` is where text inside the element goes; `axis` is an axis's dimension, for its title.
  const frames: { name: string; area: string; axis?: string }[] = [];
  const kinds: string[] = [];
  const texts: Record<string, string> = { title: "", subtitle: "", x: "", y: "" };
  const rows: string[][] = [];
  let cells = 0;
  let last = 0;
  const add = (area: string, text: string) => {
    const row = rows[rows.length - 1];
    if (area === "cell" && row?.length) row[row.length - 1] += text;
    else if (area in texts) texts[area] += text;
  };
  for (const t of tagsOf(xml)) {
    const parent = frames[frames.length - 1] ?? { name: "", area: "" };
    if (parent.area && t.from > last) add(parent.area, decodeXml(xml.slice(last, t.from)));
    last = t.to;
    if (!t.opens) {
      if (t.name === "text:p") add(parent.area, " ");
      frames.pop();
      continue;
    }
    if (t.name === "text:s" || t.name === "text:tab" || t.name === "text:line-break") add(parent.area, " ");
    else if (t.name === "chart:chart") kinds.push((attr(t.tag, "chart:class") ?? "").replace(/^chart:/, ""));
    // ponytail: a repeated row is read once and a repeated cell's text lands
    // in its last copy; a chart's own table repeats only empty padding.
    else if (t.name === "table:table-row" && cells < MAX_CELLS) rows.push([]);
    else if ((t.name === "table:table-cell" || t.name === "table:covered-table-cell") && rows.length) {
      const times = Math.min(index(t.tag, "table:number-columns-repeated") || 1, MAX_CELLS - cells);
      for (let i = 0; i < times; i++) rows[rows.length - 1].push("");
      cells += Math.max(times, 0);
    }
    if (t.closes) continue;
    let area = parent.area;
    if (t.name === "chart:title") area = parent.name === "chart:chart" ? "title" : (parent.axis ?? "");
    else if (t.name === "chart:subtitle") area = "subtitle";
    else if (t.name === "table:table-cell" || t.name === "table:covered-table-cell") area = "cell";
    else if (t.name === "chart:plot-area" || t.name === "chart:legend" || t.name === "chart:axis") area = "";
    const axis = t.name === "chart:axis" ? (attr(t.tag, "chart:dimension") === "x" ? "x" : "y") : undefined;
    frames.push({ name: t.name, area, axis });
  }

  const grid = rows
    .map((row) => {
      const cells = row.map(fold);
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      return cells;
    })
    .filter((row) => row.length);
  if (grid.length && !grid[0][0]) grid[0][0] = fold(texts.x) || "Category";
  return { label: labelOf(kinds, [texts.title, texts.subtitle, alt], [texts.y]), rows: grid };
}

export const text = (data: Uint8Array | undefined) => (data ? strFromU8(data) : "");

/** A part's path from a relationship target, relative to the part that names it unless it starts at the root. */
function resolvePart(from: string, target: string): string {
  const parts = target.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

const relsOf = (part: string) => part.replace(/([^/]*)$/, "_rels/$1.rels");

/** A part's relationships by id, each with its type and the part it points at; external targets are left out. */
export function relationships(parts: Record<string, Uint8Array>, part: string): Map<string, { type: string; part: string }> {
  const found = new Map<string, { type: string; part: string }>();
  for (const t of tagsOf(text(parts[relsOf(part)]))) {
    if (!t.opens || t.local !== "Relationship" || attr(t.tag, "TargetMode") === "External") continue;
    const id = attr(t.tag, "Id");
    const target = attr(t.tag, "Target");
    if (id && target) found.set(id, { type: attr(t.tag, "Type") ?? "", part: resolvePart(part, decodeXml(target)) });
  }
  return found;
}

/** The parts a filter keeps, or nothing when the file is no zip or unpacks past the cap. */
export function unpack(bytes: Uint8Array, keep: (name: string) => boolean): Record<string, Uint8Array> | undefined {
  let unpacked = 0;
  try {
    const parts = unzipSync(bytes, {
      filter: (file) => {
        unpacked += file.originalSize;
        return keep(file.name);
      },
    });
    return unpacked > MAX_UNPACKED ? undefined : parts;
  } catch {
    return undefined;
  }
}

/**
 * A deck's chart parts and an OpenDocument file's embedded objects, which is
 * where officeparser's chart and object nodes point: `ppt/charts/<name>` and
 * `<name>/content.xml`. Unpacked when the first such node asks.
 */
export function chartParts(bytes: Uint8Array): (name: string, alt?: string) => ChartBlock | undefined {
  let parts: Record<string, Uint8Array> | undefined;
  // A part is written once, however many nodes name it, so one chart cannot
  // spend MAX_CELLS again per copy.
  const seen = new Set<string>();
  return (name, alt) => {
    parts ??= unpack(bytes, (file) => /^ppt\/charts\/[^/]+\.xml$|^[^/]+\/content\.xml$/.test(file)) ?? {};
    if (seen.has(name)) return undefined;
    seen.add(name);
    return drawingChart(text(parts[`ppt/charts/${name}`]), alt) ?? odfChart(text(parts[`${name}/content.xml`]), alt);
  };
}

export const escapeXml = (value: string) => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A docx with each chart in its body followed by its label and a table of its
 * data, after the paragraph that holds it, and how many were written. Any
 * other file, or one with no chart, comes back as the same bytes.
 *
 * ponytail: the body only; a chart in a header or footer is left out (C7).
 */
export function withChartTables(bytes: Uint8Array): { bytes: Uint8Array; charts: number } {
  const none = { bytes, charts: 0 };
  const parts = unpack(bytes, (name) => name === "word/document.xml" || name.startsWith("word/_rels/") || name.startsWith("word/charts/"));
  const xml = text(parts?.["word/document.xml"]);
  if (!parts || !xml.includes("drawingml/2006/chart")) return none;
  const rels = relationships(parts, "word/document.xml");
  const paragraph = (value: string) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
  const out: string[] = [];
  const seen = new Set<string>();
  let pending: ChartBlock[] = [];
  let alt = "";
  let kept = 0;
  let charts = 0;
  for (const t of tagsOf(xml)) {
    if (t.opens && t.local === "docPr") alt = decodeXml(attr(t.tag, "descr") ?? "");
    else if (t.opens && t.local === "chart") {
      // A chart part reached twice (an AlternateContent copy, or a second
      // relationship to it) is written once, so it spends MAX_CELLS once.
      const part = rels.get(attr(t.tag, "r:id") ?? "")?.part;
      const block = part && !seen.has(part) ? drawingChart(text(parts[part]), alt) : undefined;
      if (part) seen.add(part);
      if (block) pending.push(block);
    } else if (!t.opens && t.name === "w:p" && pending.length) {
      out.push(xml.slice(kept, t.to));
      for (const block of pending) {
        const rows = block.rows.map((row) => `<w:tr>${row.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`);
        out.push(paragraph(block.label), rows.length ? `<w:tbl>${rows.join("")}</w:tbl>` : "");
      }
      kept = t.to;
      charts += pending.length;
      pending = [];
    }
  }
  if (charts === 0) return none;
  out.push(xml.slice(kept));
  // Stored, not deflated: the zip is only read back by the next step.
  return { bytes: zipSync({ ...unzipSync(bytes), "word/document.xml": strToU8(out.join("")) }, { level: 0 }), charts };
}

export interface WorkbookSheet {
  name: string;
  /** 0 visible, 1 hidden, 2 very hidden. */
  state: number;
  part: string;
  chartsheet: boolean;
  /** The charts and text boxes drawn on the sheet, in drawing order, then its print header and footer. */
  blocks: ChartBlock[];
}

/**
 * Excel's header and footer text with its codes (ECMA-376 18.3.1.36, MS-XLS
 * 2.4.136) left out: `&L`, `&C` and `&R` start a section, `&&` is an
 * ampersand, and every field (page, date, file), font, size, colour and
 * toggle goes (Q27 O1). The sections that hold text, `left | center | right`.
 * Text before any section code is centred, as Excel prints it.
 */
export function sheetHeaderText(code: string): string {
  const sections: Record<string, string> = { L: "", C: "", R: "" };
  const offset = /[+-]\d+/y;
  let section = "C";
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== "&") {
      sections[section] += code[i];
      continue;
    }
    const next = code[++i] ?? "";
    if (next === "&") sections[section] += "&";
    else if (next === "L" || next === "C" || next === "R") section = next;
    else if (next === '"') {
      const end = code.indexOf('"', i + 1);
      i = end < 0 ? code.length : end;
    } else if (/\d/.test(next)) while (/\d/.test(code[i + 1] ?? "")) i++;
    // A colour is six hex digits, or a theme colour and tint: `&K01+50`.
    else if (next === "K") i += /^\d\d[+-]/.test(code.slice(i + 1, i + 4)) ? 5 : 6;
    else if (next === "P") {
      // `&P+1` prints the page number plus one.
      offset.lastIndex = i + 1;
      if (offset.test(code)) i = offset.lastIndex - 1;
    }
  }
  return ["L", "C", "R"]
    .map((key) => fold(sections[key]))
    .filter(Boolean)
    .join(" | ");
}

const isOn = (tag: string, name: string) => ["1", "true"].includes(attr(tag, name) ?? "");

/**
 * A worksheet's print header and footer as `[Page header: ...]` and `[Page
 * footer: ...]`: the odd-page pair, and the even-page and first-page ones when
 * the sheet turns them on. A label already in `seen` is not written again, so
 * a footer every sheet shares is written once (Q27 O1). Tika and POI print
 * the same three, codes kept.
 */
function sheetHeaderBlocks(xml: string, seen: Set<string>): ChartBlock[] {
  const from = xml.lastIndexOf("<headerFooter");
  const end = xml.indexOf("</headerFooter>", from);
  if (from < 0 || end < 0) return [];
  const part = xml.slice(from, end);
  const blocks: ChartBlock[] = [];
  let flags = "";
  let after = 0;
  for (const t of tagsOf(part)) {
    if (t.local === "headerFooter") flags = t.tag;
    const kind = /^(odd|even|first)(Header|Footer)$/.exec(t.local);
    if (kind && t.opens) after = t.to;
    if (!kind || t.opens) continue;
    if (kind[1] === "even" && !isOn(flags, "differentOddEven")) continue;
    if (kind[1] === "first" && !isOn(flags, "differentFirst")) continue;
    const line = sheetHeaderText(decodeXml(part.slice(after, t.from)));
    const label = `[Page ${kind[2].toLowerCase()}: ${line}]`;
    if (line && !seen.has(label)) {
      seen.add(label);
      blocks.push({ label, rows: [] });
    }
  }
  return blocks;
}

/** officeparser's own test for a worksheet part, unanchored as it is. */
const WORKSHEET_PART = /xl\/worksheets\/sheet\d+.xml/;

/**
 * A workbook's sheets in tab order, each with what is drawn on it, and its
 * worksheet parts in the package's order, which is the order officeparser
 * reads them in. A text box is `[Text box: text]`. Nothing for a file that is
 * no OOXML workbook.
 */
export function workbookSheets(bytes: Uint8Array): { sheets: WorkbookSheet[]; order: string[] } {
  const order: string[] = [];
  const parts = unpack(bytes, (name) => {
    if (WORKSHEET_PART.test(name)) order.push(name);
    // ponytail: every sheet is unpacked again for its header, which sits at
    // its end; read it in officeparser's own pass if large workbooks slow.
    return /^xl\/(?:workbook\.xml|(?:[^/]+\/)?_rels\/[^/]+\.rels|(?:drawings|charts|worksheets|chartsheets)\/[^/]+\.xml)$/.test(name);
  });
  if (!parts?.["xl/workbook.xml"]) return { sheets: [], order: [] };
  const rels = relationships(parts, "xl/workbook.xml");
  const sheets: WorkbookSheet[] = [];
  const seen = new Set<string>();
  const labels = new Set<string>();
  for (const t of tagsOf(text(parts["xl/workbook.xml"]))) {
    if (!t.opens || t.local !== "sheet") continue;
    const rel = rels.get(attr(t.tag, "r:id") ?? "");
    if (!rel) continue;
    const drawings = [...relationships(parts, rel.part).values()].filter((one) => one.type.endsWith("/drawing"));
    sheets.push({
      name: decodeXml(attr(t.tag, "name") ?? ""),
      state: ({ hidden: 1, veryHidden: 2 } as Record<string, number>)[attr(t.tag, "state") ?? ""] ?? 0,
      part: rel.part,
      chartsheet: rel.type.endsWith("/chartsheet"),
      blocks: [
        ...drawings.flatMap((drawing) => drawingBlocks(parts, drawing.part, seen)),
        ...sheetHeaderBlocks(text(parts[rel.part]), labels),
      ],
    });
  }
  return { sheets, order };
}

/** The charts and text boxes of a spreadsheet drawing part, in order; a chart part in `seen` is not written again. */
function drawingBlocks(parts: Record<string, Uint8Array>, drawing: string, seen: Set<string>): ChartBlock[] {
  const xml = text(parts[drawing]);
  const rels = relationships(parts, drawing);
  const blocks: ChartBlock[] = [];
  let alt = "";
  let title = "";
  // The text of the shape being read, while inside its text body.
  let box: string | undefined;
  let textFrom = 0;
  for (const t of tagsOf(xml)) {
    if (t.opens && t.local === "cNvPr") {
      // A hidden shape's alternative text is hidden with it.
      const shown = !/^(1|true)$/.test(attr(t.tag, "hidden") ?? "");
      alt = shown ? decodeXml(attr(t.tag, "descr") ?? "") : "";
      title = shown ? decodeXml(attr(t.tag, "title") ?? "") : "";
    } else if (t.opens && t.local === "chart") {
      const part = rels.get(attr(t.tag, "r:id") ?? "")?.part;
      const block = part && !seen.has(part) ? drawingChart(text(parts[part]), alt) : undefined;
      if (part) seen.add(part);
      if (block) blocks.push(block);
    } else if (!t.opens && (t.local === "sp" || t.local === "pic")) {
      // A shape's or picture's alternative text (Q31 O1), after its own text.
      const label = altLabel("Image", [title, alt]);
      if (label) blocks.push({ label, rows: [] });
    } else if (t.local === "txBody") {
      if (t.opens && !t.closes) box = "";
      else if (!t.opens && box !== undefined) {
        if (fold(box)) blocks.push({ label: `[Text box: ${fold(box)}]`, rows: [] });
        box = undefined;
      }
    } else if (box !== undefined && t.local === "t") {
      if (!t.opens) box += decodeXml(xml.slice(textFrom, t.from));
      else textFrom = t.to;
    } else if (box !== undefined && !t.opens && t.local === "p") box += " ";
  }
  return blocks;
}
