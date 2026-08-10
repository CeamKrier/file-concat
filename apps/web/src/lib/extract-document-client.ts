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
 * Deliberately not part of the parser registry: recognition costs seconds per
 * page and downloads a language model, so it is something a person asks for
 * once, over the few files that need it, and never something ingestion does on
 * its own.
 *
 * The engine and its model come from the library's own CDN. That is a
 * third-party request, which the tool already makes for analytics and discloses
 * on `/privacy`; what still never happens is the document leaving the browser,
 * since recognition runs here over bytes we already hold.
 */
export function extractOfficeWithOcr(bytes: Uint8Array): Promise<ExtractionResult> {
  return extractOfficeDocument(bytes, {
    pdfWorkerSrc: pdfWorkerUrl,
    ocr: { language: "eng" },
  });
}
