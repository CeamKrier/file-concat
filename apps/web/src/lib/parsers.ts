import {
  createParserRegistry,
  extractNotebook,
  extractSubtitles,
  extractWithFallback,
  FIRST_READERS,
  type FirstReaderId,
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

const cfb: ParserLoader = async (bytes) => {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-cfb-client");
  return mod.extractCfb(bytes);
};

const sheetjs: ParserLoader = async (bytes) => {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-cfb-client");
  return mod.extractWorkbook(bytes);
};

const liteparse: ParserLoader = async (bytes) => {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-liteparse-client");
  return mod.extractLiteparse(bytes);
};

const anydoc: ParserLoader = async (bytes) => {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-anydoc-client");
  return mod.extractAnydoc(bytes);
};

/** Tried after a format's first reader when it has nothing usable (core `FALLBACK_READERS`). */
const fallbacks: Record<string, ParserLoader> = { anydoc, officeparser: office };

/** The readers core `FIRST_READERS` names for formats that do not start with officeparser. */
const firstReaders: Record<FirstReaderId, ParserLoader> = { liteparse, sheetjs, anydoc };
const firstReader = (format?: string) => {
  const id = FIRST_READERS[format ?? ""];
  return id ? { id, read: firstReaders[id] } : { id: "officeparser", read: office };
};

export const parsers: ParserRegistry = createParserRegistry({
  office: (bytes, format) =>
    extractWithFallback(firstReader(format), fallbacks, bytes, format),
  // The same library reads an epub (its zip of XHTML chapters walks the OPF
  // spine), so the id costs no second download.
  epub: office,
  cfb: (bytes, format) => extractWithFallback({ id: "cfb", read: cfb }, fallbacks, bytes, format),
  email: async (bytes) => {
    if (import.meta.env.SSR) return { text: "" };
    const mod = await import("./extract-email-client");
    return mod.extractEmail(bytes);
  },
  mobi: async (bytes) => {
    if (import.meta.env.SSR) return { text: "" };
    const mod = await import("./extract-ebook-client");
    return mod.extractMobi(bytes);
  },
  // A page a browser saved, never HTML source (core `savedPageUrl`).
  html: async (bytes) => {
    if (import.meta.env.SSR) return { text: "" };
    const mod = await import("./extract-html-client");
    return mod.extractHtml(bytes);
  },
  // Not lazy, and deliberately: both are pure functions over text with no
  // dependency behind them, so a dynamic import would buy a round trip and save
  // a couple of KB. They are safe on the server for the same reason.
  notebook: async (bytes) => extractNotebook(bytes),
  subtitles: async (bytes) => extractSubtitles(bytes),
});

/**
 * A live page the url import fetched, read like a saved one: the article as
 * Markdown, or the whole body when no article is found. Not a {@link ParserLoader}:
 * it takes text `fetch` already decoded, and the address it came from.
 */
export async function readFetchedPage(html: string, url: string): Promise<string> {
  if (import.meta.env.SSR) return html;
  const mod = await import("./extract-html-client");
  return mod.readHtml(html, url).text || html;
}

/** Video containers whose own subtitle track is read (extraction router, D4). */
export const SUBTITLE_TRACK_FORMATS: ReadonlySet<string> = new Set(["iso-bmff", "matroska"]);

/**
 * Not a {@link ParserLoader}: it takes the file, not its bytes, because a video
 * is never read whole. "" when the video has no text subtitle track.
 */
export async function readSubtitleTrack(file: Blob, format: string): Promise<string> {
  if (import.meta.env.SSR) return "";
  const mod = await import("./extract-video-track-client");
  return mod.readSubtitleTrack(file, format);
}
