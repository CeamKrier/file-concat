import { createParserRegistry, type ParserRegistry } from "@fileconcat/core";

/**
 * The web's parser loader map (ADR-0012). Core routes; this decides what the
 * browser build is actually willing to download.
 *
 * Every loader is a dynamic import, so a drop of `.docx` files never fetches
 * the PDF path and a drop with no documents at all fetches neither.
 *
 * When the worker pool lands, this map moves *inside* the extraction worker
 * module. Importing a parser here to hand it to a worker would load the
 * multi-MB parser on the main thread — the exact cost the pool exists to avoid.
 */
export const parsers: ParserRegistry = createParserRegistry({
  office: async (bytes) => {
    // Mirrors tokens.ts: the heavy officeparser + pdf.js path is client-only and
    // must never be pulled into the Cloudflare SSR worker bundle.
    if (import.meta.env.SSR) return { text: "" };
    const mod = await import("./extract-document-client");
    return mod.extractOffice(bytes);
  },
  // `epub` is routed but deliberately has no loader yet: officeparser gains it
  // in 7.5.1, which drags pdfjs-dist through a major version. Until then an
  // EPUB surfaces "couldn't extract text" — the documented behaviour for a
  // format whose reader a build does not carry, not a misclassification.
});
