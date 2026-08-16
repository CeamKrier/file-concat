/**
 * The parser contract (ADR-0012).
 *
 * Core owns this type, the router that picks a {@link ParserId}, and the
 * static signature-to-parser mapping. Core does *not* own the loaders: the CLI
 * bundles core (`tsup noExternal`), so every `import()` written here would
 * become a published-package runtime dependency, and browser asset URLs
 * (`?url`) are Vite syntax that cannot appear in a package tsup also builds for
 * node. Each platform therefore registers its own loader map.
 */

/**
 * A reader FileConcat knows how to route to. This is a property of the
 * *format*, not of the readers a given build ships (CONTEXT.md): a platform
 * with no loader for an id answers "couldn't extract text", it does not
 * reclassify the file.
 */
export type ParserId = "office" | "epub" | "notebook" | "subtitles" | "email";

/**
 * What a parser could not recover. A **closed** set, deliberately: these are
 * ADR-0008 content gaps, and the summary composes its own sentence from the
 * kind rather than passing through whatever prose a parser happened to write.
 */
export type ExtractionNoteKind =
  /** Embedded images, charts or annotations whose text never made it out. */
  | "attachments-skipped"
  /** Pages or slides that failed to load; the rest of the document is present. */
  | "pages-skipped"
  /** OCR ran over an image-only page and produced nothing. */
  | "ocr-failed"
  /**
   * The reader reached for a CDN instead of the asset we self-host. ADR-0003
   * promises extraction never leaves the device, so this is a tripwire, not a
   * detail: it means a third-party request happened.
   */
  | "cdn-fallback"
  /** This build registers no loader for the format the router picked (ADR-0011). */
  | "parser-unavailable"
  /**
   * Text came out of the document as characters nobody can read, and it was
   * left out rather than passed on. A document whose fonts carry no character
   * map extracts as glyph numbers read as if they were letters, which arrives
   * looking like text and is not. Measured on a real one 2026-08-16.
   */
  | "text-undecodable";

export interface ExtractionNote {
  kind: ExtractionNoteKind;
  /** How many items the note covers, when the kind is countable. */
  count?: number;
  /**
   * The `# Page n` numbers the note covers, when the loss can be placed. Absent
   * where it cannot — a format that has no page markers, or a loss too small to
   * put a page beyond use. A caller that can re-read a page (recognition) uses
   * this to re-read *only* those pages and leave the rest of the document at the
   * exact text it already extracted.
   */
  pages?: number[];
}

/**
 * Every parser answers with this. `text === ""` still means "couldn't extract"
 * exactly as it did before the registry (ADR-0003, ADR-0009); `notes` only says
 * *why*, and is populated on partial successes too.
 */
export interface ExtractionResult {
  /** The recovered text, trimmed. Empty when nothing could be recovered. */
  text: string;
  notes?: ExtractionNote[];
}

/** A platform's implementation of one {@link ParserId}. */
export type ParserLoader = (bytes: Uint8Array) => Promise<ExtractionResult>;

export interface ParserRegistry {
  /** True when this build ships a reader for `id`. */
  has(id: ParserId): boolean;
  /**
   * Run the registered loader. An unregistered id is not an error: it answers
   * with empty text and a `parser-unavailable` note, which is the documented
   * behaviour for a format whose reader this build does not carry.
   */
  extract(id: ParserId, bytes: Uint8Array): Promise<ExtractionResult>;
}
