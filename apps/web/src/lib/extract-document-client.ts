import { extractDocument } from "@fileconcat/core";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Client-only document extraction. Imports the heavy officeparser path and the
 * self-hosted pdf.js worker; only ever reached through the dynamic import in
 * ./extract-document, so none of this lands in the Cloudflare SSR worker.
 *
 * `pdfWorkerUrl` is our own vendored copy of pdf.js's worker (version-locked to
 * the pdfjs-dist bundled inside officeparser — see ADR-0003). Serving it from
 * our origin keeps extraction fully offline; officeparser's default is a CDN URL.
 */
export function extractDocumentText(bytes: Uint8Array): Promise<string> {
  return extractDocument(bytes, { pdfWorkerSrc: pdfWorkerUrl });
}
