import { formatDoc, formatMsg, formatPpt, type CfbStreams, type ExtractionResult } from "@fileconcat/core";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";

/**
 * Client-only reader for the OLE2 compound file (`D0 CF 11 E0`). Excel, Word
 * and PowerPoint 97-2003, Outlook `.msg` and a password-protected OOXML file
 * all share that signature; only the stream directory inside says which, so
 * the router cannot tell them apart on a prefix and hands every one here.
 *
 * SheetJS reads the workbook ones (BIFF), and opens the container of an
 * Outlook message, a Word document or a PowerPoint deck for core's own
 * readers. For the rest (a locked OOXML file) this answers
 * `parser-unavailable`, as core's deck reader does for a PowerPoint 95 file:
 * the chain then tries its fallback (anydoc), and failing that the ingest loop
 * treats the file exactly as any other it cannot read, and the ledger names
 * it from the extension.
 *
 * Reached only through the dynamic import in ./parsers, so the library never
 * lands in the SSR worker. The package is the maintained build from SheetJS's
 * own CDN, not npm's stale 0.18.5.
 */
interface CfbContainer {
  FullPaths: string[];
  FileIndex: { content?: Uint8Array | number[] }[];
}

export function extractCfb(bytes: Uint8Array): ExtractionResult {
  const container = XLSX.CFB.read(bytes, { type: "array" }) as CfbContainer;
  // Paths come back under the root storage's own name ("Root Entry/", or
  // whatever the writer called it); core's readers want them relative.
  const rootless = (path: string) => path.slice(path.indexOf("/") + 1);
  const streams = (): CfbStreams => {
    const out = new Map<string, Uint8Array>();
    container.FullPaths.forEach((entry, index) => {
      const content = container.FileIndex[index]?.content;
      if (content && !entry.endsWith("/")) out.set(rootless(entry), new Uint8Array(content));
    });
    return out;
  };
  // A message keeps its fixed-size properties in one stream at the root; the
  // same stream name inside a recipient or attachment storage is not the tell.
  if (container.FullPaths.some((entry) => rootless(entry) === "__properties_version1.0")) {
    return formatMsg(streams());
  }
  if (container.FullPaths.some((entry) => rootless(entry) === "WordDocument")) {
    return formatDoc(streams());
  }
  if (container.FullPaths.some((entry) => rootless(entry) === "PowerPoint Document")) {
    return formatPpt(streams());
  }
  // `Workbook` is BIFF8 (Excel 97-2003), `Book` is BIFF5 (Excel 5/95), in any
  // case: stream names compare case-insensitively (MS-CFB 2.6.4), and some
  // writers store `WORKBOOK`.
  if (!container.FullPaths.some((entry) => /(^|\/)(Workbook|Book)$/i.test(entry))) {
    return { text: "", notes: [{ kind: "parser-unavailable" }] };
  }
  return extractWorkbook(bytes);
}

/**
 * Any workbook SheetJS reads: BIFF from the container above, and `.xlsx`,
 * `.xlsm` and `.xlsb` first in their chain (extraction router, R5). A heading
 * per sheet, then the rows as csv, with each cell as Excel formats it.
 *
 * By default every row is padded with commas out to the sheet's declared range
 * and an empty row is a line of commas. `strip` drops the padding, and a run of
 * empty rows becomes one blank line: the gap between two tables on a sheet,
 * which Docling and Unstructured also split on.
 */
export function extractWorkbook(bytes: Uint8Array): ExtractionResult {
  const workbook = XLSX.read(bytes, { type: "array" });
  let comments = 0;
  const sheets = workbook.SheetNames.flatMap((name, index) => {
    const sheet = workbook.Sheets[name] as (XLSX.WorkSheet & { "!type"?: string; "!drawel"?: { Target?: string } }) | undefined;
    // SheetJS lists a sheet it failed to parse and leaves its entry out.
    if (!sheet) return [];
    // A hidden sheet is still the author's data, often the lookup a formula
    // reads, so it stays and says so (Q18 O1, as docling files it apart). Only
    // a macro can show a very hidden one, so that is named apart.
    const state = ["", " (hidden)", " (very hidden)"][workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0] ?? "";
    // A chartsheet holds no cells, so its csv is empty and the filter below
    // used to drop it, name and all. Tika, docling and openpyxl all keep every
    // sheet a workbook lists; this keeps the name and the chart's title.
    if (sheet["!type"] === "chart") {
      const title = chartTitle(bytes, sheet["!drawel"]?.Target);
      return [`# Sheet: ${name} (chart)${state}${title ? `\nChart: ${title}` : ""}`];
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, { strip: true }).replace(/\n{3,}/g, "\n\n").trim();
    const notes = cellComments(sheet);
    comments += notes.length;
    const body = [csv, ...notes].filter(Boolean).join("\n");
    return body ? [`# Sheet: ${name}${state}\n${body}`] : [];
  });
  return { text: sheets.join("\n\n"), ...(comments ? { notes: [{ kind: "comments-included" as const, count: comments }] } : {}) };
}

/**
 * A sheet's cell comments as csv rows after its cells, `[Comment, B2, author:
 * text]` (Q24 O1), the shape the office reader gives every other format's. A
 * thread's later entries are its replies.
 */
function cellComments(sheet: XLSX.WorkSheet): string[] {
  return Object.keys(sheet)
    .filter((key) => !key.startsWith("!"))
    .map((key) => ({ key, at: XLSX.utils.decode_cell(key), thread: (sheet[key] as XLSX.CellObject).c ?? [] }))
    .sort((a, b) => a.at.r - b.at.r || a.at.c - b.at.c)
    .flatMap(({ key, thread }) =>
      thread.flatMap((comment, index) => {
        const fold = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
        const author = fold(comment.a);
        // Excel opens a note's own text with its author's name and a colon.
        const body = fold(author && comment.t?.startsWith(`${author}:`) ? comment.t.slice(author.length + 1) : comment.t);
        if (!body) return [];
        const label = [comment.T && index > 0 ? "Reply" : "Comment", key, author].filter(Boolean).join(", ");
        const cell = `[${label}: ${body}]`;
        return [`"${cell.replace(/"/g, '""')}"`];
      }),
    );
}

/**
 * The title of the chart a chartsheet's drawing holds, read from the package:
 * SheetJS keeps the drawing's path and nothing of the chart. Only the text
 * before the plot area is the chart's own title; an axis title sits inside it.
 * A BIFF workbook is no zip, and any part missing means no title.
 */
function chartTitle(bytes: Uint8Array, drawing: string | undefined): string | undefined {
  if (!drawing) return undefined;
  const resolve = (from: string, target: string) => new URL(target, `file:///${from}`).pathname.slice(1);
  const drawingPath = resolve("xl/chartsheets/sheet.xml", drawing);
  const relsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, { filter: (file) => file.name === relsPath || file.name.startsWith("xl/charts/") });
  } catch {
    return undefined;
  }
  const rels = parts[relsPath] ? strFromU8(parts[relsPath]) : "";
  const target = /Type="[^"]*\/chart"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/chart"/.exec(rels);
  const chart = target && parts[resolve(drawingPath, target[1] ?? target[2])];
  if (!chart) return undefined;
  const head = strFromU8(chart).split("<c:plotArea")[0];
  const title = /<c:title>([\s\S]*?)<\/c:title>/.exec(head)?.[1] ?? "";
  const text = [...title.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((run) => run[1]).join("");
  return decodeXml(text).trim() || undefined;
}

function decodeXml(text: string): string {
  return text.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (entity, hex, dec, name: string) => {
    if (name) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name.toLowerCase()]!;
    const code = parseInt(hex ?? dec, hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}
