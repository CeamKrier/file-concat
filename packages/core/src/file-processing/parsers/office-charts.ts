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
export function labelOf(kinds: string[], parts: string[], values: string[]): string {
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
export const MAX_CELLS = 100_000;

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
  /** The rows and columns it hides, the charts and text boxes drawn on the sheet in drawing order, then its validation rules, print header and footer, and defined names. */
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

/** `B3` for row 2, column 1, both counted from 0. */
export function cellName(row: number, col: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return `${name}${row + 1}`;
}

/** At most this many runs of rows, then of columns, before "+N more". */
const HIDDEN_RUNS = 20;

/**
 * `[Hidden: rows 7-9, 12, column E]` for the rows and columns a sheet hides,
 * given as inclusive ranges counted from 0. The cells stay in the reading
 * (Q34 O1): a hidden row is often the lookup or the working a total reads,
 * and the line tells a reader which of them the author does not show.
 */
export function hiddenLabel(rows: ReadonlyArray<readonly [number, number]>, cols: ReadonlyArray<readonly [number, number]>): string | undefined {
  const runs = (ranges: ReadonlyArray<readonly [number, number]>, name: (n: number) => string, one: string, many: string) => {
    const merged: [number, number][] = [];
    for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    if (!merged.length) return "";
    const listed = merged.slice(0, HIDDEN_RUNS).map(([from, to]) => (from === to ? name(from) : `${name(from)}-${name(to)}`));
    const more = merged.length > HIDDEN_RUNS ? ` +${merged.length - HIDDEN_RUNS} more` : "";
    return `${merged.length === 1 && merged[0][0] === merged[0][1] ? one : many} ${listed.join(", ")}${more}`;
  };
  const parts = [
    runs(rows, (n) => String(n + 1), "row", "rows"),
    runs(cols, (n) => cellName(0, n).slice(0, -1), "column", "columns"),
  ].filter(Boolean);
  return parts.length ? `[Hidden: ${parts.join(", ")}]` : undefined;
}

/** The last row and column a sheet's `A1:G16` range reaches, from 0. */
export function rangeEnd(ref: string): { row: number; col: number } | undefined {
  const end = /([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!end) return undefined;
  const col = Array.from(end[1]).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(end[2]) - 1, col };
}

/** Ranges cut at `last`, those past it dropped. */
export function within(ranges: ReadonlyArray<readonly [number, number]>, last: number): [number, number][] {
  return ranges.filter(([from]) => from <= last).map(([from, to]) => [from, Math.min(to, last)]);
}

/**
 * A worksheet's hidden rows and columns, inside the range its cells use: a
 * column hidden out to XFD to tidy the sheet hides nothing of the author's.
 * A row an outline collapsed or a filter left out is hidden the same way.
 */
function hiddenBlocks(xml: string): ChartBlock[] {
  const end = rangeEnd(attr(/<dimension\b[^>]*>/.exec(xml)?.[0] ?? "", "ref") ?? "");
  const rows: [number, number][] = [];
  const cols: [number, number][] = [];
  // A pattern, not a walk over every cell's tag: only the row and col tags count.
  for (const [tag] of xml.matchAll(/<(?:\w+:)?(?:row|col)\s[^>]*>/g)) {
    if (!isOn(tag, "hidden")) continue;
    if (/^<(?:\w+:)?row/.test(tag)) {
      const r = Number(attr(tag, "r")) - 1;
      if (r >= 0) rows.push([r, r]);
    } else {
      const min = Number(attr(tag, "min")) - 1;
      if (min >= 0) cols.push([min, Math.max(min, Number(attr(tag, "max")) - 1 || min)]);
    }
  }
  const label = hiddenLabel(end ? within(rows, end.row) : rows, end ? within(cols, end.col) : cols);
  return label ? [{ label, rows: [] }] : [];
}

/** What a data validation rule tells the person filling the cell. */
export interface CellRule {
  promptTitle?: string;
  prompt?: string;
  /** The allowed values, or the range they are read from. */
  allowed?: string;
  errorTitle?: string;
  error?: string;
}

/**
 * `[Validation, F3: title: prompt; allowed: a, b; error: title: text]`, each
 * part only when there is one. The prompt and the error message are text the
 * author wrote for whoever fills the cell, and the list is what the cell may
 * hold. No reader surveyed writes them (Tika, POI, markitdown, docling,
 * unstructured, 2026-10-15); a model asked to fill or check a template needs
 * them, so they are carried as the comments are.
 */
export function validationLabel(where: string, rule: CellRule): string | undefined {
  const pair = (title?: string, body?: string) => [title, body].map((one) => fold(one ?? "")).filter(Boolean).join(": ");
  const parts = [
    pair(rule.promptTitle, rule.prompt),
    rule.allowed ? `allowed: ${fold(rule.allowed)}` : "",
    pair(rule.errorTitle, rule.error) ? `error: ${pair(rule.errorTitle, rule.error)}` : "",
  ].filter(Boolean);
  return parts.length ? `[Validation${where ? `, ${where}` : ""}: ${parts.join("; ")}]` : undefined;
}

/** A list rule's values from its formula: a quoted literal is the list, anything else the range it is read from. */
export function listValues(formula: string): string {
  const literal = /^"([\s\S]*)"$/.exec(formula.trim());
  return literal ? literal[1].split(",").map((one) => one.trim()).filter(Boolean).join(", ") : `values in ${formula.trim()}`;
}

/**
 * A worksheet's data validation rules as label blocks: the `dataValidations`
 * block and the Excel 2010 one in `extLst`, whose list may read another sheet.
 * A prompt Excel does not show (`showInputMessage` off) or an error it does
 * not raise is left out, as text the author switched off.
 */
function validationBlocks(xml: string): ChartBlock[] {
  const blocks: ChartBlock[] = [];
  for (const name of ["dataValidations", "x14:dataValidations"]) {
    const from = xml.indexOf(`<${name}`);
    const end = from < 0 ? -1 : xml.indexOf(`</${name}>`, from);
    if (end < 0) continue;
    const part = xml.slice(from, end);
    let rule = "";
    let formula = "";
    let sqref = "";
    let after = 0;
    for (const t of tagsOf(part)) {
      const inner = part.slice(after, t.from);
      after = t.to;
      if (t.local === "dataValidation" && t.opens) {
        rule = t.tag;
        formula = "";
        sqref = attr(t.tag, "sqref") ?? "";
      } else if (!t.opens && (t.local === "formula1" || t.local === "f") && !formula && !inner.includes("<")) formula = decodeXml(inner);
      else if (!t.opens && t.local === "sqref") sqref = inner;
      if (t.local !== "dataValidation" || !t.closes) continue;
      const label = validationLabel(sqref.trim().replace(/\s+/g, " "), {
        ...(isOn(rule, "showInputMessage") ? { promptTitle: decodeXml(attr(rule, "promptTitle") ?? ""), prompt: decodeXml(attr(rule, "prompt") ?? "") } : {}),
        ...(attr(rule, "type") === "list" && formula ? { allowed: listValues(formula) } : {}),
        ...(isOn(rule, "showErrorMessage") ? { errorTitle: decodeXml(attr(rule, "errorTitle") ?? ""), error: decodeXml(attr(rule, "error") ?? "") } : {}),
      });
      if (label) blocks.push({ label, rows: [] });
    }
  }
  return blocks;
}

export interface DefinedName {
  name: string;
  ref: string;
  /** The sheet a local name belongs to, by its place in the workbook. */
  sheet?: number;
  comment?: string;
}

/**
 * A name that points at an error points at nothing: a deleted range (`#REF!`, which
 * POI's `Name.isDeleted` tests for) or a function the writer did not know.
 */
const BROKEN_NAME = /#REF!|^#(?:NAME\?|N\/A|VALUE!|DIV\/0!|NULL!|NUM!)$/;

/**
 * Each defined name as `[Name: Revenue = Data!$B$2:$B$13; comment]`, by the
 * sheet it belongs to: its own for a local name, else the sheet its reference
 * starts with, else the first. Excel's own names (`_xlnm.Print_Area`, the
 * filter range) and hidden ones are left out: the workbook's machinery, not
 * the author's. No reader surveyed writes names (2026-10-15); a name is the
 * author's own label for a range, which a formula elsewhere reads by.
 */
export function nameBlocks(names: readonly DefinedName[], sheets: readonly string[]): Map<string, ChartBlock[]> {
  const found = new Map<string, ChartBlock[]>();
  for (const one of names) {
    if (!one.name || one.name.startsWith("_xlnm.") || !one.ref || BROKEN_NAME.test(one.ref)) continue;
    const named = /^'?((?:[^'!]|'')+)'?!/.exec(one.ref)?.[1]?.replace(/''/g, "'");
    const sheet = (one.sheet !== undefined ? sheets[one.sheet] : undefined) ?? (named && sheets.includes(named) ? named : sheets[0]);
    if (sheet === undefined) continue;
    const label = `[Name: ${fold(one.name)} = ${fold(one.ref)}${one.comment && fold(one.comment) ? `; ${fold(one.comment)}` : ""}]`;
    found.set(sheet, [...(found.get(sheet) ?? []), { label, rows: [] }]);
  }
  return found;
}

/** A workbook part's defined names, hidden ones left out. */
function definedNames(xml: string): DefinedName[] {
  const names: DefinedName[] = [];
  let open = "";
  let after = 0;
  for (const t of tagsOf(xml)) {
    if (t.local !== "definedName") continue;
    if (t.opens) {
      open = t.tag;
      after = t.to;
    } else if (!isOn(open, "hidden")) {
      const local = attr(open, "localSheetId");
      names.push({
        name: decodeXml(attr(open, "name") ?? ""),
        ref: decodeXml(xml.slice(after, t.from)),
        ...(local !== undefined ? { sheet: Number(local) } : {}),
        comment: decodeXml(attr(open, "comment") ?? ""),
      });
    }
  }
  return names;
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
  const workbook = text(parts["xl/workbook.xml"]);
  const sheets: WorkbookSheet[] = [];
  const seen = new Set<string>();
  const labels = new Set<string>();
  for (const t of tagsOf(workbook)) {
    if (!t.opens || t.local !== "sheet") continue;
    const rel = rels.get(attr(t.tag, "r:id") ?? "");
    if (!rel) continue;
    const drawings = [...relationships(parts, rel.part).values()].filter((one) => one.type.endsWith("/drawing"));
    const xml = text(parts[rel.part]);
    sheets.push({
      name: decodeXml(attr(t.tag, "name") ?? ""),
      state: ({ hidden: 1, veryHidden: 2 } as Record<string, number>)[attr(t.tag, "state") ?? ""] ?? 0,
      part: rel.part,
      chartsheet: rel.type.endsWith("/chartsheet"),
      blocks: [
        ...hiddenBlocks(xml),
        ...drawings.flatMap((drawing) => drawingBlocks(parts, drawing.part, seen)),
        ...validationBlocks(xml),
        ...sheetHeaderBlocks(xml, labels),
      ],
    });
  }
  const names = nameBlocks(definedNames(workbook), sheets.map((sheet) => sheet.name));
  for (const sheet of sheets) sheet.blocks.push(...(names.get(sheet.name) ?? []));
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
