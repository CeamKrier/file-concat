import type { ExtractionResult } from "@fileconcat/core";
import * as XLSX from "xlsx";

/**
 * Client-only reader for the OLE2 compound file (`D0 CF 11 E0`). Excel, Word
 * and PowerPoint 97-2003, Outlook `.msg` and a password-protected OOXML file
 * all share that signature; only the stream directory inside says which, so
 * the router cannot tell them apart on a prefix and hands every one here.
 *
 * SheetJS reads the workbook ones (BIFF). For the rest this answers
 * `parser-unavailable`: the ingest loop then treats the file exactly as any
 * other it cannot read, and the ledger names it from the extension ("Word
 * 97-2003 document. Save it as .docx and it will be read.").
 *
 * Reached only through the dynamic import in ./parsers, so the library never
 * lands in the SSR worker. The package is the maintained build from SheetJS's
 * own CDN, not npm's stale 0.18.5.
 */
export function extractCfb(bytes: Uint8Array): ExtractionResult {
  const container = XLSX.CFB.read(bytes, { type: "array" }) as { FullPaths: string[] };
  // `Workbook` is BIFF8 (Excel 97-2003), `Book` is BIFF5 (Excel 5/95).
  if (!container.FullPaths.some((entry) => /(^|\/)(Workbook|Book)$/.test(entry))) {
    return { text: "", notes: [{ kind: "parser-unavailable" }] };
  }
  const workbook = XLSX.read(bytes, { type: "array" });
  // The same shape the office reader renders an .xlsx to: a heading per sheet,
  // then the rows as csv, so the two workbook formats read alike in a bundle.
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    csv: XLSX.utils.sheet_to_csv(workbook.Sheets[name]).trim(),
  })).filter((sheet) => sheet.csv);
  return { text: sheets.map((sheet) => `# Sheet: ${sheet.name}\n${sheet.csv}`).join("\n\n") };
}
