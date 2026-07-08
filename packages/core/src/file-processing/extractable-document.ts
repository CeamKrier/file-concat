/**
 * "Extractable document" — a file whose container bytes are not legible text
 * but whose format carries recoverable text (see CONTEXT.md and ADR-0003).
 * FileConcat extracts the text and includes the *extracted text* in the
 * bundle, rather than excluding the file as a plain binary.
 *
 * This list is the single source of truth for which formats qualify; both the
 * web app and the CLI route by it.
 */
export const EXTRACTABLE_DOCUMENT_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "odt",
  "ods",
  "odp",
] as const;

export type ExtractableDocumentExtension = (typeof EXTRACTABLE_DOCUMENT_EXTENSIONS)[number];

const EXTENSION_SET: ReadonlySet<string> = new Set(EXTRACTABLE_DOCUMENT_EXTENSIONS);

/** True when `filename`'s final extension names an extractable document format. */
export function isExtractableDocument(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && EXTENSION_SET.has(ext);
}

export interface ExtractDocumentOptions {
  /**
   * URL of the pdf.js worker script, required to parse PDFs in the browser
   * (ignored for the zip-based formats). Self-host it to keep processing fully
   * offline instead of the library's CDN default — see ADR-0003.
   */
  pdfWorkerSrc?: string;
}

/**
 * Extract the recoverable text from an extractable document's bytes. Returns
 * the trimmed text, or an empty string when the document carries none — a
 * scanned image-only or encrypted PDF. Callers treat empty as "couldn't
 * extract" and surface it rather than silently dropping the file (ADR-0003).
 *
 * `officeparser` is imported dynamically so its multi-MB browser build (pdf.js)
 * is code-split and only fetched the first time a document is encountered.
 */
export async function extractDocument(
  bytes: Uint8Array,
  options: ExtractDocumentOptions = {},
): Promise<string> {
  const { parseOffice } = await import("officeparser");
  const config = options.pdfWorkerSrc ? { pdfWorkerSrc: options.pdfWorkerSrc } : {};
  const ast = await parseOffice(bytes, config);
  return ast.toText().trim();
}
