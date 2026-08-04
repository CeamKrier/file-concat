import type { ExtractionNote, ExtractionNoteKind, ExtractionResult } from "./types";

/**
 * The `office` parser: `officeparser` reads PDF, the OOXML family (docx / xlsx
 * / pptx), OpenDocument (odt / ods / odp) and RTF through one entry point, so
 * all of those share a single {@link ParserId}.
 *
 * This module is the *implementation*; the platform decides whether to load it
 * (ADR-0012). `officeparser` is imported dynamically so its multi-MB browser
 * build (pdf.js) is code-split and only fetched the first time a document is
 * actually encountered.
 */

export interface OfficeParserOptions {
  /**
   * URL of the pdf.js worker script, required to parse PDFs in the browser
   * (ignored for the zip-based formats). Self-host it to keep processing fully
   * offline instead of the library's CDN default — see ADR-0003.
   */
  pdfWorkerSrc?: string;
}

/**
 * `officeparser` warning codes mapped onto our closed note kinds. Codes not
 * listed here are dropped rather than passed through: a note exists to tell the
 * consuming model what is missing from the bundle, and a performance tip or a
 * whitespace-node notice is not that.
 */
const NOTE_BY_CODE: Readonly<Record<string, ExtractionNoteKind>> = {
  ATTACHMENT_EXTRACTION_FAILED: "attachments-skipped",
  IMAGE_EXTRACTION_FAILED: "attachments-skipped",
  IMAGE_PROCESSING_FAILED: "attachments-skipped",
  ANNOTATION_EXTRACTION_FAILED: "attachments-skipped",
  CHART_DATA_EXTRACTION_FAILED: "attachments-skipped",
  PAGE_LOAD_FAILED: "pages-skipped",
  OCR_FAILED: "ocr-failed",
  // Not a cosmetic warning: it means the library gave up on our self-hosted
  // worker and fetched pdf.js from a CDN, which breaks the ADR-0003 promise
  // that extraction never leaves the device.
  PDF_WORKER_FALLBACK: "cdn-fallback",
  DEPENDENCY_LOAD_FAILED: "parser-unavailable",
};

/** Tally the library's per-document warnings into counted notes, in first-seen order. */
function toNotes(messages: ReadonlyArray<{ code: string }>): ExtractionNote[] {
  const counts = new Map<ExtractionNoteKind, number>();
  for (const message of messages) {
    const kind = NOTE_BY_CODE[message.code];
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, count]) => ({ kind, count }));
}

/**
 * Extract the recoverable text from a document's bytes. Empty text means the
 * document carries none — a scanned image-only or encrypted PDF — and callers
 * surface that rather than silently dropping the file (ADR-0003).
 */
export async function extractOfficeDocument(
  bytes: Uint8Array,
  options: OfficeParserOptions = {},
): Promise<ExtractionResult> {
  const { parseOffice } = await import("officeparser");
  const config = options.pdfWorkerSrc ? { pdfWorkerSrc: options.pdfWorkerSrc } : {};
  const ast = await parseOffice(bytes, config);
  // `.to("text")` replaces the deprecated `.toText()`, and hands back the
  // per-document warnings that become our notes.
  const { value, messages } = await ast.to("text");
  const notes = toNotes(messages);
  return notes.length > 0 ? { text: value.trim(), notes } : { text: value.trim() };
}
