import {
  createParserRegistry,
  extractNotebook,
  extractSubtitles,
  type ParserLoader,
  type ParserRegistry,
} from "@fileconcat/core";

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
const office: ParserLoader = async (bytes, format) => {
  // Mirrors tokens.ts: the heavy officeparser + pdf.js path is client-only and
  // must never be pulled into the Cloudflare SSR worker bundle.
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-document-client");
  return mod.extractOffice(bytes, format);
};

export const parsers: ParserRegistry = createParserRegistry({
  office,
  // The same library reads an epub (its zip of XHTML chapters walks the OPF
  // spine), so the id costs no second download.
  epub: office,
  email: async (bytes) => {
    if (import.meta.env.SSR) return { text: "" };
    const mod = await import("./extract-email-client");
    return mod.extractEmail(bytes);
  },
  // Not lazy, and deliberately: both are pure functions over text with no
  // dependency behind them, so a dynamic import would buy a round trip and save
  // a couple of KB. They are safe on the server for the same reason.
  notebook: async (bytes) => extractNotebook(bytes),
  subtitles: async (bytes) => extractSubtitles(bytes),
});
