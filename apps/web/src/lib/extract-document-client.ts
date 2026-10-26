import { extractOfficeDocument, type ExtractionResult } from "@fileconcat/core";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jbig2Url from "pdfjs-dist/wasm/jbig2.wasm?url";
import jpxUrl from "pdfjs-dist/wasm/openjpeg.wasm?url";

/**
 * Client-only document extraction. Imports the heavy officeparser path and the
 * self-hosted pdf.js worker; only ever reached through the dynamic import in
 * ./parsers, so none of this lands in the Cloudflare SSR worker.
 *
 * `pdfWorkerUrl` is our own vendored copy of pdf.js's worker (version-locked to
 * the pdfjs-dist bundled inside officeparser — see ADR-0003). Serving it from
 * our origin keeps extraction fully offline; officeparser's default is a CDN URL.
 */
export function extractOffice(bytes: Uint8Array, format?: string): Promise<ExtractionResult> {
  return extractOfficeDocument(bytes, { pdfWorkerSrc: pdfWorkerUrl, format });
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
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  return extractOfficeDocument(bytes, {
    pdfWorkerSrc: pdfWorkerUrl,
    ocr: { language },
    abortSignal: signal,
  });
}

/**
 * The longest side an image is scaled to before it is read. Recognition works
 * from roughly 300 DPI and a phone photo arrives at several times that, where
 * the extra pixels cost seconds and buy nothing. A guess, like the floor in
 * `ocr.ts`; `ocr_conf` is what will say whether it is set too low.
 */
const MAX_IMAGE_SIDE = 2000;

/**
 * Read the writing off an image (ADR-0017). Returns the reading and tesseract's
 * mean confidence in it; the caller decides whether that clears the floor.
 *
 * The picture goes through a canvas first, for two reasons that both bite. A
 * PNG is transparent where nothing is drawn, and black-on-transparent reads as
 * black-on-black — the same trap as a rendered PDF page. And an oversized image
 * is scaled down there rather than sent whole.
 *
 * A format the browser cannot decode goes to the recogniser untouched: TIFF is
 * the live case, since no current browser gives `createImageBitmap` a TIFF and
 * tesseract reads one directly.
 */
export async function recogniseImage(
  file: File,
  language: string,
  signal?: AbortSignal,
): Promise<{ text: string; confidence: number }> {
  const image = await flattenImage(file);
  const worker = await untilStopped(readerFor(language), signal);
  const { data } = await untilStopped(worker.recognize(image), signal);
  return { text: data.text.trim(), confidence: data.confidence };
}

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

/**
 * The recogniser for the pass in hand, made once and kept until the pass
 * releases it. A worker per image paid the engine's start and the language
 * data's load on every image, which on a drop of forty screenshots was most of
 * the wait. Keyed by language because a pass reads in exactly one.
 */
let reader: { language: string; worker: Promise<TesseractWorker> } | null = null;

/** The pass's recogniser, made on first use. Resolves once its language is
 * loaded, which on the first pass of all is the download. */
export function readerFor(language: string): Promise<TesseractWorker> {
  if (reader?.language === language) return reader.worker;
  void releaseReader();
  const worker = import("tesseract.js").then(({ createWorker }) => createWorker(language));
  const current = { language, worker };
  reader = current;
  // A failed load is not kept, or every later image would fail on it too.
  worker.catch(() => {
    if (reader === current) reader = null;
  });
  return worker;
}

/** End the pass's recogniser. Safe to call with none running. */
export async function releaseReader(): Promise<void> {
  const current = reader;
  reader = null;
  const worker = await current?.worker.catch(() => null);
  await worker?.terminate();
}

/**
 * The work, or an AbortError the moment the pass is stopped. tesseract cannot
 * cancel a page and a terminated worker never answers, so the stop rejects on
 * its own and ends the recogniser, which is what frees the page in hand.
 */
function untilStopped<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(new DOMException("Stopped", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      void releaseReader();
      reject(new DOMException("Stopped", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** The image on an opaque white ground, scaled to {@link MAX_IMAGE_SIDE}, or the
 * original file when the browser cannot decode it. */
async function flattenImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
    canvas.width = 0;
    canvas.height = 0;
    return blob ?? file;
  } finally {
    bitmap.close();
  }
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
 * The decoders a scanned page is usually drawn with: JPEG 2000 (`openjpeg`),
 * and JBIG2 and CCITT fax (`jbig2`). pdf.js 6 loads them from `wasmUrl`, a
 * directory, which our hashed asset names cannot be; without them those images
 * draw blank and recognition reads nothing (38 of 181 olmOCR-bench scan pages,
 * 2026-10-03). pdf.js's public `BinaryDataFactory` hands it the bytes instead,
 * fetched here on the first image that needs one. The ICC colour module stays
 * off, which shifts colours and does not change what recognition reads.
 */
class BinaryData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "wasmUrl" ? { "jbig2.wasm": jbig2Url, "openjpeg.wasm": jpxUrl }[filename] : undefined;
    if (!url) throw new Error(`No ${kind} ${filename} here`);
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  }
}

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
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const loading = pdfjs.getDocument({ data: bytes, BinaryDataFactory: BinaryData });
  const pdf = await loading.promise;
  const canvas = document.createElement("canvas");
  const read = new Map<number, string>();
  try {
    const worker = await untilStopped(readerFor(language), signal);
    for (const [index, number] of pages.entries()) {
      // A page is the unit of work here, so the stop lands at page granularity
      // rather than document granularity: seconds instead of minutes on a
      // document that is all pictures. What was read before it stays read.
      if (signal?.aborted) break;
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
      const { data } = await untilStopped(worker.recognize(blob), signal);
      if (data.text.trim()) read.set(number, data.text.trim());
    }
  } catch (error) {
    // A stop keeps the pages read before it, as the loop's own check does.
    if (!signal?.aborted) throw error;
  } finally {
    // Frees the page bitmaps and the worker pdf.js started for this document;
    // a rescue can run over several documents in one drop.
    canvas.width = 0;
    canvas.height = 0;
    await loading.destroy();
  }
  return read;
}
