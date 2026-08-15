import type { OfficeContentNode } from "officeparser";
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
  /**
   * Read the pixels of images the document carries, so a scanned page yields
   * its text instead of nothing. Absent means no OCR, which is the default
   * everywhere: recognition costs seconds per page and, left unconfigured,
   * downloads its engine from a third party — neither is acceptable without
   * the caller having asked.
   */
  ocr?: OcrOptions;
}

/**
 * Where the recogniser comes from and what it should expect to read.
 *
 * Every path defaults to the library's own, which resolves to a CDN. Point
 * them at same-origin copies to keep the ADR-0003 promise that using the tool
 * makes no third-party request; the bytes being read never travel either way,
 * but *that* a document was opened would.
 */
export interface OcrOptions {
  /** Tesseract language code, `+`-joined for several (`"eng+deu"`). Defaults to English. */
  language?: string;
  /** Tesseract worker script URL. */
  workerPath?: string;
  /** Tesseract core (wasm) URL. */
  corePath?: string;
  /** Base URL for `.traineddata` language files. */
  langPath?: string;
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
 * An image the library lifted out of a document. `name` is what the rendered
 * text refers to it by; `ocrText` is present only when recognition ran and
 * found something.
 */
interface ExtractedImage {
  name?: string;
  ocrText?: string;
}

/**
 * Rendering to text writes `[Image: <name>]` where an extracted image sat and
 * keeps any recognised text on the image itself, so OCR output never reaches a
 * caller that reads only the string. Put each image's text where its
 * placeholder stood, so a scanned page and a page that carried real text stay
 * in reading order.
 *
 * An image that yielded nothing has its placeholder removed instead of left
 * standing. That matters more than it looks: `[Image: page1.bmp]` is not
 * content, but it *is* a non-empty string, and every caller decides whether a
 * document was readable by asking whether the text is empty. Leaving it would
 * turn an unreadable scan into a silent success carrying a filename.
 *
 * Only placeholders naming an image we actually received are touched, so a
 * document whose own prose happens to contain that shape survives intact.
 *
 * Exported for its own tests: exercising it through {@link extractOfficeDocument}
 * would mean running a real recogniser, which costs seconds per page and
 * downloads a language model.
 */
export function resolveImagePlaceholders(text: string, images: readonly ExtractedImage[]): string {
  let resolved = text;
  for (const image of images) {
    if (!image.name) continue;
    // split/join rather than a regex: a filename is not a pattern, and escaping
    // one to pretend otherwise is a bug waiting for the first odd character.
    resolved = resolved.split(`[Image: ${image.name}]`).join(image.ocrText?.trim() ?? "");
  }
  return resolved;
}

/**
 * Which renderer reproduces a document faithfully depends on what the document
 * *is*, and the parsed tree answers that without consulting a filename: a
 * workbook's top level is `sheet` nodes.
 *
 * The text renderer writes a spreadsheet row with **no separator between
 * cells** — `EMEA12001350` where the sheet held `EMEA | 1200 | 1350` — so the
 * values are not merely awkward to read, they cannot be recovered; and it drops
 * the sheet names, so several sheets arrive as one undivided block. The csv
 * renderer keeps both, and writes each sheet under a `# Sheet: <name>` line.
 *
 * Everywhere else the text renderer is the faithful one: it already lays a
 * table out as aligned pipe rows, while csv keeps *only* tables — a docx
 * rendered to csv is its tables and none of the prose around them.
 */
function isWorkbook(content: ReadonlyArray<{ type: string }> | undefined): boolean {
  return content?.some((node) => node.type === "sheet") ?? false;
}

/**
 * Write a `# Slide n` line at the top of each slide, matching the `# Sheet:`
 * lines the csv renderer already writes for a workbook.
 *
 * A deck has no punctuation of its own. The text renderer emits every slide's
 * lines one after another, so the last bullet of slide one and the title of
 * slide two arrive as consecutive lines and a fifty-slide deck reads as one
 * undivided list — the reader cannot tell which points belong together, which
 * is most of what a slide *is*. No renderer option adds the boundary: markdown
 * writes a bare `---` between slides, unnumbered, and drags an empty YAML
 * frontmatter block and `{#anchor}` suffixes along with it.
 *
 * The generator visits each node before rendering it and takes mutations, so
 * the marker is prepended as an ordinary paragraph rather than by patching the
 * string afterwards, where slide text of our own shape would be indistinguishable
 * from a marker we wrote.
 */
function markSlideStarts(): (node: OfficeContentNode) => void {
  let seen = 0;
  return (node) => {
    if (node.type !== "slide") return;
    seen += 1;
    // The library's own number is the truthful one when it has it; the counter
    // covers a deck whose slides carry no metadata.
    const label = `# Slide ${node.metadata?.slideNumber ?? seen}`;
    node.children = [
      { type: "paragraph", text: label, children: [{ type: "text", text: label }] },
      ...(node.children ?? []),
    ];
  };
}

function toLibraryConfig(options: OfficeParserOptions): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (options.pdfWorkerSrc) config.pdfWorkerSrc = options.pdfWorkerSrc;
  if (options.ocr) {
    const { language, ...paths } = options.ocr;
    // The two flags are inseparable. Recognition only ever runs over images the
    // library has extracted, so `ocr` alone does nothing — and `extractAttachments`
    // alone is worse than either, because it fills the text with `[Image: …]`
    // placeholders that read as a successful extraction. Never expose one
    // without the other.
    config.ocr = true;
    config.extractAttachments = true;
    config.ocrConfig = {
      ...(language ? { language } : {}),
      // An unset path means "the library's default", which is a CDN. Passing
      // one through only when we have it keeps that choice with the caller.
      ...Object.fromEntries(Object.entries(paths).filter(([, value]) => Boolean(value))),
    };
  }
  return config;
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
  const ast = await parseOffice(bytes, toLibraryConfig(options));
  // Recognised image text reaches us as `[Image: …]` placeholders in the
  // rendered string, and csv has nowhere to write them. A workbook that carries
  // any is therefore rendered as text: its cells run together, exactly as they
  // did before this choice existed, but nothing OCR recovered is thrown away.
  const carriesOcrText = (ast.attachments ?? []).some((image) => image.ocrText?.trim());
  // `.to(…)` replaces the deprecated `.toText()`, and hands back the
  // per-document warnings that become our notes.
  const { value, messages } =
    isWorkbook(ast.content) && !carriesOcrText
      ? await ast.to("csv")
      : await ast.to("text", { onNode: markSlideStarts() });
  // Only the pdf and csv renderers can answer with bytes; both of ours are
  // string-shaped, so this narrows a union rather than handling a real case.
  const rendered = typeof value === "string" ? value : new TextDecoder().decode(value);
  const text = resolveImagePlaceholders(rendered, ast.attachments ?? []).trim();
  const notes = toNotes(messages);
  return notes.length > 0 ? { text, notes } : { text };
}
