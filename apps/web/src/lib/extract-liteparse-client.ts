import { assemblePdfPages, noteLayersOff, pdfMayHoldFormsOrFiles, pdfTitle, type ExtractionResult, type PdfPage } from "@fileconcat/core";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { readPdfForms, withPdfForms, type PdfForms } from "./pdf-forms";
import { workerRunner } from "./worker-runner";

/**
 * The first PDF reader (extraction router, step R3): liteparse, 2.49 MiB
 * gzipped, fetched on the first PDF. On olmOCR-bench's text-layer pages it
 * scored 49.5 against the officeparser/pdf.js path's 26.3, columns 65.5 against
 * 20.5 (2026-10-03). pdf.js stays behind it in the chain and keeps drawing
 * pages for recognition, and reads a form's fields and attached files.
 */

// ponytail: the whole document in one parse; liteparse's wasm heap has a
// ceiling, and a PDF past it throws and falls back to pdf.js. Batch sessions
// (`openBatchSession`) if `extract_reader` shows big PDFs landing there.
const read = workerRunner<Uint8Array, { pages: PdfPage[]; skipped: number }>(
  () => new Worker(new URL("./liteparse.worker.ts", import.meta.url), { type: "module" }),
  120_000,
);

/** The fields and attached files, or none when pdf.js cannot open the file: they add to the reading, never decide it. */
async function forms(bytes: Uint8Array): Promise<PdfForms> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return await readPdfForms(pdfjs, bytes);
  } catch {
    return { pages: new Map(), files: [] };
  }
}

export async function extractLiteparse(bytes: Uint8Array): Promise<ExtractionResult> {
  // A copy is handed over, so the caller's bytes stay usable for the fallback.
  const copy = bytes.slice();
  const { pages, skipped } = await read(copy, [copy.buffer]);
  const extra = pdfMayHoldFormsOrFiles(bytes) ? await forms(bytes) : undefined;
  // liteparse reports a PDF's creator and producer, not its title (Q30 O2).
  const title = pdfTitle(bytes);
  const assembled = extra ? assemblePdfPages(withPdfForms(pages, extra), skipped, extra.files) : assemblePdfPages(pages, skipped);
  return { ...noteLayersOff(assembled, bytes), ...(title ? { title } : {}) };
}
