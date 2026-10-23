import type { ScannedDocument } from "~/hooks/use-file-ingestion";

/**
 * How much of a held scan is read without being asked (Q112 O1, 2026-10-23).
 *
 * Past the auto-read caps a scan used to wait for a press, and over 30 days 31
 * drops of 1-3 scanned PDFs (69 MB on average) held that way had none. Every
 * reader we compared reads a small unit by itself (Acrobat the page in view)
 * and leaves the whole document to a press with its scope stated. So the first
 * pages of each are read as the drop's last stage, and the row names the rest.
 *
 * Pages are the unit because the wait is per page: a few seconds each on a
 * laptop without a GPU, so six pages is a wait in seconds, under what the caps
 * already allow for a small drop.
 */
export const PREVIEW_PAGES = 3;
export const PREVIEW_MAX_PAGES = 6;

/**
 * pdf.js holds the whole file to draw one page of it, so a document past this
 * is not opened unasked: a tab that runs out of memory loses the bundle too.
 * ponytail: a guess, not a measurement; `ocr_preview_skipped` with `size`
 * against `ocr_deferred` says whether it sits in the right place.
 */
export const PREVIEW_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Why a held document got no first pages, as `ocr_preview_skipped` records it.
 * `shape`: not a whole scan with its pages listed (a document already in the
 * bundle with part of itself has text to show). `size`: past
 * {@link PREVIEW_MAX_BYTES}. `budget`: the six pages were spent. The pass adds
 * `blank`, `error` and `stopped` for the ones it opened.
 */
export type PreviewSkip = "shape" | "size" | "budget" | "blank" | "error" | "stopped";

/**
 * The pages to read from each document, in drop order, until the budget runs
 * out, and why each of the others is left to the offer.
 */
export function planPreview(documents: readonly ScannedDocument[]): {
  read: { document: ScannedDocument; first: number[] }[];
  skipped: { document: ScannedDocument; reason: PreviewSkip }[];
} {
  const read: { document: ScannedDocument; first: number[] }[] = [];
  const skipped: { document: ScannedDocument; reason: PreviewSkip }[] = [];
  let left = PREVIEW_MAX_PAGES;
  for (const document of documents) {
    if (document.format !== "pdf" || document.text || !document.pages?.length) {
      skipped.push({ document, reason: "shape" });
    } else if (document.file.size > PREVIEW_MAX_BYTES) {
      skipped.push({ document, reason: "size" });
    } else if (left === 0) {
      skipped.push({ document, reason: "budget" });
    } else {
      const first = document.pages.slice(0, Math.min(PREVIEW_PAGES, left));
      read.push({ document, first });
      left -= first.length;
    }
  }
  return { read, skipped };
}
