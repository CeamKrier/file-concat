import { formatDoc, formatMsg, type CfbStreams, type ExtractionResult } from "@fileconcat/core";
import * as XLSX from "xlsx";

/**
 * Client-only reader for the OLE2 compound file (`D0 CF 11 E0`). Excel, Word
 * and PowerPoint 97-2003, Outlook `.msg` and a password-protected OOXML file
 * all share that signature; only the stream directory inside says which, so
 * the router cannot tell them apart on a prefix and hands every one here.
 *
 * SheetJS reads the workbook ones (BIFF), and opens the container of an
 * Outlook message or a Word document for core's own readers. For the rest
 * (PowerPoint, a locked OOXML file) this answers `parser-unavailable`: the
 * ingest loop then treats the file exactly as any other it cannot read, and
 * the ledger names it from the extension ("PowerPoint 97-2003 file. Save it
 * as .pptx and it will be read.").
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
