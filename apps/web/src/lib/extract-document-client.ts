import { extractOfficeDocument, type ExtractionResult } from "@fileconcat/core";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Client-only document extraction. Imports the heavy officeparser path and the
 * self-hosted pdf.js worker; only ever reached through the dynamic import in
 * ./parsers, so none of this lands in the Cloudflare SSR worker.
 *
 * `pdfWorkerUrl` is our own vendored copy of pdf.js's worker (version-locked to
 * the pdfjs-dist bundled inside officeparser — see ADR-0003). Serving it from
 * our origin keeps extraction fully offline; officeparser's default is a CDN URL.
 */
export function extractOffice(bytes: Uint8Array): Promise<ExtractionResult> {
  return extractOfficeDocument(bytes, { pdfWorkerSrc: pdfWorkerUrl });
}

/**
 * The same extraction with recognition turned on, for a document the ordinary
 * reader found no text in — a scan, which is a picture of a page and carries no
 * characters to read.
 *
 * Reached only from the recognition stage of a drop, over the documents that
 * already came back empty, so a drop with no scan in it never loads any of it.
 *
 * The language comes from the browser's own settings; see `ocr-language.ts` for
 * why it is one language and not several. The engine and its model come from
 * the library's own CDN. That is a third-party request, which the tool already
 * makes for analytics and discloses on `/privacy`; what still never happens is
 * the document leaving the browser, since recognition runs here over bytes we
 * already hold.
 */
export function extractOfficeWithOcr(
  bytes: Uint8Array,
  language: string,
): Promise<ExtractionResult> {
  return extractOfficeDocument(bytes, {
    pdfWorkerSrc: pdfWorkerUrl,
    ocr: { language },
  });
}

/**
 * How large the page is drawn before it is read. Measured 2026-08-16 against the
 * real document that prompted this: at 2 every row of its border-crossing table
 * came back correct in 900 ms, at 3 a date came back as `24106/2024` for 1682 ms,
 * at 4 correct again for 2390 ms. So the middle setting is not a middle result —
 * resampling noise decides it — and the cheapest one that reads is the one to use.
 */
const RENDER_SCALE = 2;

/**
 * Read named pages of a PDF by drawing them and recognising the picture.
 *
 * This is the rescue for a page whose fonts carry no character map: the text is
 * *there*, drawn correctly, and only the mapping from glyph number back to
 * letter is missing — so a reader sees nonsense while a camera would see Turkish.
 * Recognition over a rendered page is that camera. It is not the ordinary path
 * and must never become it: measured over the corpus, extraction is 10x to 160x
 * faster and exact, while recognition keeps 89% of a table's words and invents a
 * few of its own around logos and barcodes.
 *
 * Only the named pages are drawn. A document is rarely broken all the way
 * through, and a page that decoded holds the document's own characters — trading
 * those for a near-miss of them is a loss, not a rescue.
 *
 * officeparser's own OCR cannot do this: it recognises embedded *images*, and
 * these pages carry none. They are drawings of text.
 */
export async function readPdfPages(
  bytes: Uint8Array,
  pages: readonly number[],
  language: string,
  onPage?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const { createWorker } = await import("tesseract.js");

  const loading = pdfjs.getDocument({ data: bytes });
  const pdf = await loading.promise;
  const worker = await createWorker(language);
  const canvas = document.createElement("canvas");
  const read = new Map<number, string>();
  try {
    for (const [index, number] of pages.entries()) {
      onPage?.(index, pages.length);
      if (number < 1 || number > pdf.numPages) continue;
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) break;
      // A PDF page is transparent where nothing is drawn, and recognition over
      // black-on-transparent reads as black-on-black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob) continue;
      const { data } = await worker.recognize(blob);
      if (data.text.trim()) read.set(number, data.text.trim());
    }
  } finally {
    await worker.terminate();
    // Frees the page bitmaps and the worker pdf.js started for this document;
    // a rescue can run over several documents in one drop.
    canvas.width = 0;
    canvas.height = 0;
    await loading.destroy();
  }
  return read;
}
