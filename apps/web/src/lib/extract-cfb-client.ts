import {
  biffSheetFurniture,
  formatDoc,
  formatMsg,
  formatPpt,
  linkWorthWriting,
  nameBlocks,
  workbookSheets,
  type CfbStreams,
  type ExtractionResult,
} from "@fileconcat/core";
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
  // A UTF-8 byte-order mark before the signature, from a server that sent the
  // file as text, is no part of the container; the sectors after it are whole.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0xd0) bytes = bytes.subarray(3);
  let container: CfbContainer;
  try {
    container = XLSX.CFB.read(bytes, { type: "array" }) as CfbContainer;
  } catch {
    throw new Error("The compound file is damaged: its sector tables do not hold together");
  }
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
  const book = container.FullPaths.findIndex((entry) => /(^|\/)(Workbook|Book)$/i.test(entry));
  if (book < 0) return { text: "", notes: [{ kind: "parser-unavailable" }] };
  // SheetJS reads a sheet's Header and Footer records and keeps nothing of them.
  const content = container.FileIndex[book]?.content;
  return extractWorkbook(bytes, content ? biffSheetFurniture(new Uint8Array(content)) : undefined);
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
export function extractWorkbook(bytes: Uint8Array, furniture?: ReturnType<typeof biffSheetFurniture>): ExtractionResult {
  const workbook = XLSX.read(bytes, { type: "array" });
  // SheetJS keeps nothing of a chart, a text box or a print header; core reads
  // them from the package (C6, C7). A BIFF workbook is no zip: its headers
  // come from the caller, and it has no drawing here.
  const drawn = new Map(workbookSheets(bytes).sheets.map((sheet) => [sheet.name, sheet.blocks]));
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  // A BIFF workbook's defined names come from SheetJS; a package's from core, with the rest.
  const names = zipped
    ? undefined
    : nameBlocks(
        (workbook.Workbook?.Names ?? [])
          // SheetJS marks a hidden name Hidden, outside its type: seen on an
          // xlsx, not checked on a BIFF Lbl record, which no writer here can make.
          .filter((one) => !(one as { Hidden?: boolean }).Hidden)
          // A BIFF name whose formula is a constant comes back as that number or boolean, not a string.
          .map((one) => ({
            name: String(one.Name ?? ""),
            ref: typeof one.Ref === "boolean" ? (one.Ref ? "TRUE" : "FALSE") : String(one.Ref ?? ""),
            sheet: one.Sheet ?? undefined,
            comment: typeof one.Comment === "string" ? one.Comment : undefined,
          })),
        workbook.SheetNames,
      );
  for (const [name, blocks] of [...(furniture ?? []), ...(names ?? [])]) drawn.set(name, [...(drawn.get(name) ?? []), ...blocks]);
  let comments = 0;
  let veryHidden = 0;
  const sheets = workbook.SheetNames.flatMap((name, index) => {
    const sheet = workbook.Sheets[name] as (XLSX.WorkSheet & { "!type"?: string }) | undefined;
    // SheetJS lists a sheet it failed to parse and leaves its entry out.
    if (!sheet) return [];
    // A hidden sheet is still the author's data, often the lookup a formula
    // reads, so it stays and says so (Q18 O1, as docling files it apart). Only
    // a macro can show a very hidden one: it is left out and counted (Q34 O1).
    const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
    if (hidden === 2) {
      veryHidden++;
      return [];
    }
    // A macro sheet's cells are Excel 4 macro formulas and their results, not
    // data. SheetJS marks one "macro", a value its types leave out.
    const state = `${(sheet["!type"] as string | undefined) === "macro" ? " (macro)" : ""}${hidden === 1 ? " (hidden)" : ""}`;
    const drawing = (drawn.get(name) ?? []).flatMap((block) => [[block.label], ...block.rows]).map(csvRow);
    // A chartsheet holds no cells, so its csv is empty and the filter below
    // used to drop it, name and all. Tika, docling and openpyxl all keep every
    // sheet a workbook lists; this keeps the name and the chart.
    if (sheet["!type"] === "chart") return [[`# Sheet: ${name} (chart)${state}`, ...drawing].join("\n")];
    const csv = XLSX.utils.sheet_to_csv(sheet, { strip: true }).replace(/\n{3,}/g, "\n\n").trim();
    const notes = cellComments(sheet);
    comments += notes.length;
    // In the office reader's order: cells, what is drawn on the sheet, comments, then links.
    const body = [csv, ...drawing, ...notes, ...cellLinks(sheet, zipped)].filter(Boolean).join("\n");
    return body ? [`# Sheet: ${name}${state}\n${body}`] : [];
  });
  const title = workbook.Props?.Title;
  const said = [
    ...(veryHidden ? [{ kind: "hidden-left-out" as const, count: veryHidden }] : []),
    ...(comments ? [{ kind: "comments-included" as const, count: comments }] : []),
  ];
  return {
    text: sheets.join("\n\n"),
    ...(said.length ? { notes: said } : {}),
    ...(title ? { title } : {}),
  };
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
 * A sheet's hyperlinks as csv rows after its comments, `[Link, B2: address;
 * tooltip]` (Q32 O1): the csv holds a cell's text and nothing of where it
 * points. A link to a place in the workbook (`#Sheet2!A1`) is skipped, as an
 * anchor is in a document, and so is one whose cell text is its address. A
 * link over a range is one object on every cell of it, and is written once.
 *
 * The tooltip only from a zip workbook: SheetJS fills it from a BIFF link's
 * display name too, which writers set to their own name ("SheetJS", "url").
 */
function cellLinks(sheet: XLSX.WorkSheet, tips: boolean): string[] {
  const seen = new Set<XLSX.Hyperlink>();
  return Object.keys(sheet)
    .filter((key) => !key.startsWith("!"))
    .map((key) => ({ key, at: XLSX.utils.decode_cell(key), cell: sheet[key] as XLSX.CellObject }))
    .sort((a, b) => a.at.r - b.at.r || a.at.c - b.at.c)
    .flatMap(({ key, cell }) => {
      const link = cell.l;
      const text = String(cell.w ?? cell.v ?? "");
      const address = (link?.Target ?? "").replace(/\s+/g, "");
      if (!link || seen.has(link) || address.startsWith("#") || !linkWorthWriting(text, address)) return [];
      seen.add(link);
      const tip = tips ? (link.Tooltip ?? "").replace(/\s+/g, " ").trim() : "";
      return [csvRow([`[Link, ${key}: ${address}${tip && tip !== text && tip !== address ? `; ${tip}` : ""}]`])];
    });
}

/** A csv row, quoting a cell as SheetJS does. */
function csvRow(cells: readonly string[]): string {
  return cells.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",");
}
