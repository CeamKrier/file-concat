import { assemblePdfPages, type ExtractionResult, type PdfPage } from "@fileconcat/core";

import { workerRunner } from "./worker-runner";

/**
 * The first PDF reader (extraction router, step R3): liteparse, 2.49 MiB
 * gzipped, fetched on the first PDF. On olmOCR-bench's text-layer pages it
 * scored 49.5 against the officeparser/pdf.js path's 26.3, columns 65.5 against
 * 20.5 (2026-10-03). pdf.js stays behind it in the chain and keeps drawing
 * pages for recognition.
 */

// ponytail: the whole document in one parse; liteparse's wasm heap has a
// ceiling, and a PDF past it throws and falls back to pdf.js. Batch sessions
// (`openBatchSession`) if `extract_reader` shows big PDFs landing there.
const read = workerRunner<Uint8Array, { pages: PdfPage[]; skipped: number }>(
  () => new Worker(new URL("./liteparse.worker.ts", import.meta.url), { type: "module" }),
  120_000,
);

export async function extractLiteparse(bytes: Uint8Array): Promise<ExtractionResult> {
  // A copy is handed over, so the caller's bytes stay usable for the fallback.
  const copy = bytes.slice();
  const { pages, skipped } = await read(copy, [copy.buffer]);
  return assemblePdfPages(pages, skipped);
}
