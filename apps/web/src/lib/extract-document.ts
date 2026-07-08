/**
 * Extract text from an extractable document (PDF / Office / OpenDocument)
 * entirely in the browser. The heavy officeparser + pdf.js code lives in
 * ./extract-document-client and is only dynamically imported on the client, so
 * it never enters the Cloudflare SSR worker bundle (mirrors tokens.ts).
 *
 * Returns the extracted text, or an empty string when the document carries none
 * (scanned image-only or encrypted PDF) — the caller surfaces that, never
 * silently drops the file. See ADR-0003.
 */
export async function extractDocumentText(bytes: Uint8Array): Promise<string> {
  if (import.meta.env.SSR) return "";
  const mod = await import("./extract-document-client");
  return mod.extractDocumentText(bytes);
}
