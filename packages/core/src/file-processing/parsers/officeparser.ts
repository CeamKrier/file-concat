import { strFromU8, unzipSync } from "fflate";
import type { OfficeContentNode } from "officeparser";
import { altLabel } from "./alt-text";
import { chartParts, withChartTables, workbookSheets, type ChartBlock } from "./office-charts";
import { odfPageFurniture, odsSheetFurniture, slideMasterText } from "./office-furniture";
import { withoutHiddenText } from "./office-hidden";
import { wordListLabels } from "./office-lists";
import { linkWorthWriting } from "./office-links";
import { noteLayersOff } from "./pdf-layers";
import { pdfTitle, rtfTitle } from "./title";
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
  /**
   * Abandon the parse, and with it any recognition it started.
   *
   * Only recognition makes this worth having: ordinary extraction is fast
   * enough that nobody asks to stop it, while a scanned page is seconds of work
   * with no natural break in it. `officeparser` honours the signal inside its
   * own recogniser queue and terminates the worker holding the page, so this is
   * the difference between a stop that lands now and one that lands whenever
   * the page in hand happens to finish.
   */
  abortSignal?: AbortSignal;
  /**
   * The format the router detected. The library sniffs a buffer itself, but its
   * reader table stops at the base formats: an `.xlsm` sniffs as `xlsm` and
   * is refused, although the package inside is an `.xlsx`. Naming the base
   * format here is what lets the macro-enabled and template variants through.
   */
  format?: string;
}

/**
 * Detected format -> the reader the library should run. The variants are the
 * same package under a different content type; the library only warns about
 * the mismatch between what it sniffed and what it was told.
 */
const LIBRARY_FILE_TYPE: Readonly<Record<string, string>> = {
  docm: "docx",
  dotx: "docx",
  dotm: "docx",
  xlsm: "xlsx",
  xltx: "xlsx",
  xltm: "xlsx",
  pptm: "pptx",
  potx: "pptx",
  potm: "pptx",
  ppsx: "pptx",
  ppsm: "pptx",
};

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
function toNotes(messages: ReadonlyArray<{ code: string; details?: unknown }>): ExtractionNote[] {
  const counts = new Map<ExtractionNoteKind, number>();
  for (const message of messages) {
    const kind = NOTE_BY_CODE[message.code];
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const notes: ExtractionNote[] = [...counts].map(([kind, count]) => ({ kind, count }));
  // pdf.js past its text or time budget (officeparser 8) leaves the rest of the
  // PDF unread, which is a hole of unknown size: a note with no count. Past the
  // operator budget only images and colours stop, and the text is all there.
  const cut = messages.some(
    ({ code, details }) =>
      code === "PDF_CONTENT_LIMIT_EXCEEDED" && (details as { limit?: string } | undefined)?.limit !== "maxOperators",
  );
  if (cut) notes.push({ kind: "pages-skipped" });
  return notes;
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
 * Write a `# Slide n` or `# Page n` line at the top of each slide and each PDF
 * page, matching the `# Sheet:` lines the csv renderer already writes for a
 * workbook.
 *
 * Neither a deck nor a PDF has punctuation of its own. The text renderer emits
 * every slide's and every page's lines one after another, so the last bullet of
 * slide one and the title of slide two arrive as consecutive lines and a
 * fifty-slide deck reads as one undivided list — the reader cannot tell which
 * points belong together, which is most of what a slide *is*. No renderer
 * option adds the boundary: markdown writes a bare `---` between slides,
 * unnumbered, and drags an empty YAML frontmatter block and `{#anchor}`
 * suffixes along with it.
 *
 * A page marker also carries something a slide marker does not. A page whose
 * content is a scanned image contributes no text at all, and where the document
 * has other pages that do, the file never looks empty and nothing anywhere said
 * a page was lost. Marked, that page is a heading with nothing under it, which
 * is at least visible.
 *
 * The generator visits each node before rendering it and takes mutations, so
 * the marker is prepended as an ordinary paragraph rather than by patching the
 * string afterwards, where document text of our own shape would be
 * indistinguishable from a marker we wrote.
 *
 * `markPages` is off for a document whose pages all came back empty, and that
 * is not a detail: a marker is ours, not the document's, and a wholly scanned
 * PDF answering with a list of headings instead of `""` would read as a
 * successful extraction to every caller — the exact silent-success failure that
 * an empty string exists to prevent (ADR-0003).
 */
function markSectionStarts(
  markPages: boolean,
  hidden: ReadonlySet<number> = new Set(),
): (node: OfficeContentNode) => void {
  const seen = { slide: 0, page: 0 };

  return (node) => {
    // The library's own number is the truthful one when it has it; the counters
    // cover a document whose sections carry no metadata.
    let label;
    if (node.type === "slide") {
      seen.slide += 1;
      const number = node.metadata?.slideNumber ?? seen.slide;
      // A hidden slide is still the author's text, so it stays, and says so.
      label = `# Slide ${number}${hidden.has(number) ? " (hidden)" : ""}`;
    } else if (node.type === "page" && markPages) {
      seen.page += 1;
      label = `# Page ${node.metadata?.pageNumber ?? seen.page}`;
    } else return;

    node.children = [
      { type: "paragraph", text: label, children: [{ type: "text", text: label }] },
      ...(node.children ?? []),
    ];
  };
}

/**
 * Drop the slide number a deck's speaker notes carry.
 *
 * A notes slide inherits a slide-number placeholder from the notes master, so
 * the parsed note holds a line whose whole text is the slide's own number, and
 * the renderer writes it out under the slide body. What arrives is a bare `3`
 * on a line of its own, directly beneath whatever the slide said — under a
 * table of figures it is indistinguishable from another figure.
 *
 * It is also redundant twice over: `# Slide 3` already stands above the slide,
 * and says which slide it is where a reader will look for it.
 *
 * Matched against the note's own `slideNumber` rather than against "a line that
 * is only digits", so a speaker note genuinely consisting of a number survives
 * unless it happens to be that slide's number. Footnotes are untouched — they
 * carry a `noteType` and no slide number.
 */
function dropSlideNumberFromNotes(node: OfficeContentNode): void {
  if (node.type !== "note" || node.metadata?.slideNumber === undefined) return;
  const number = String(node.metadata.slideNumber);
  node.children = (node.children ?? []).filter((child) => child.text?.trim() !== number);
}

/**
 * Label a slide's speaker notes. The renderer writes them straight under the
 * slide body, where "Open with the counters" reads as one more bullet on the
 * slide. Shaped like the `--- Notes ---` label footnotes get; MarkItDown heads
 * them `### Notes:` for the same reason. Footnotes carry a `noteType` and are
 * left to {@link numberFootnotes}.
 */
function labelSpeakerNotes(node: OfficeContentNode): void {
  if (node.type !== "note" || node.metadata?.noteType || !node.children?.some((child) => child.text?.trim())) return;
  const label = "--- Speaker notes ---";
  node.children = [{ type: "paragraph", text: label, children: [{ type: "text", text: label }] }, ...node.children];
}

/** What {@link slideChrome} found on one slide. */
interface SlideChrome {
  hidden: boolean;
  /** Paragraphs of its slide-number placeholder. */
  number: Set<string>;
  /** Paragraphs of its footer and date placeholders. */
  repeated: Set<string>;
}

/**
 * Read what a deck's slide XML says and officeparser's tree does not: which
 * paragraphs fill a footer, date or slide-number placeholder, and which slides
 * are hidden (`show="0"`). officeparser reads `p:ph` only to find a title, so
 * those three placeholders reach the text as body lines, and it ignores `show`.
 * Keyed by the slide's position in the deck (`p:sldIdLst`), which is the
 * number officeparser 8 gives a slide; a part's own number is only its file
 * name, and a reordered deck no longer matches it. Anything that is not a
 * readable zip of slides gives an empty map.
 */
function slideChrome(bytes: Uint8Array): Map<number, SlideChrome> {
  const slides = new Map<number, SlideChrome>();
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => /^ppt\/(?:slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(file.name),
    });
  } catch {
    return slides;
  }
  const decode = (text: string) =>
    text.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (entity, hex, dec, name: string) => {
      if (name) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name.toLowerCase()]!;
      const code = parseInt(hex ?? dec, hex ? 16 : 10);
      // Past U+10FFFF fromCodePoint throws, and one bad entity must not fail the deck.
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
  // The opening tag that starts at `from`, found by index rather than by a
  // pattern, so a crafted part cannot make the scan quadratic.
  const tagAt = (xml: string, from: number) => (from < 0 ? "" : xml.slice(from, xml.indexOf(">", from) + 1));
  const position = deckOrder(parts, tagAt);
  for (const [name, data] of Object.entries(parts)) {
    if (!name.startsWith("ppt/slides/")) continue;
    const xml = strFromU8(data);
    const chrome: SlideChrome = {
      hidden: /\sshow="(?:0|false)"/.test(tagAt(xml, xml.indexOf("<p:sld"))),
      number: new Set(),
      repeated: new Set(),
    };
    // Shapes do not nest, so each piece before a `</p:sp>` holds one shape's
    // markup, and each piece of that before an `</a:p>` one paragraph's.
    for (const shape of xml.split("</p:sp>")) {
      const type = tagAt(shape, shape.indexOf("<p:ph")).match(/\stype="(sldNum|ftr|dt)"/)?.[1];
      if (!type) continue;
      for (const paragraph of shape.split("</a:p>")) {
        const text = decode([...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join("")).trim();
        if (text) (type === "sldNum" ? chrome.number : chrome.repeated).add(text);
      }
    }
    slides.set(position.get(name) ?? Number(name.match(/(\d+)\.xml$/)![1]), chrome);
  }
  return slides;
}

/**
 * Each slide part's position in the deck: `p:sldIdLst` in order, each entry's
 * `r:id` resolved through the presentation's relationships. Empty when either
 * part is missing, and the caller falls back to the part's own number.
 */
function deckOrder(parts: Record<string, Uint8Array>, tagAt: (xml: string, from: number) => string): Map<string, number> {
  const order = new Map<string, number>();
  const rels = parts["ppt/_rels/presentation.xml.rels"];
  const presentation = parts["ppt/presentation.xml"];
  if (!rels || !presentation) return order;
  const targets = new Map<string, string>();
  // Each scan resumes past the tag it read, so a part of opening tags that
  // never close is still read once.
  const tags = (xml: string, open: string) => {
    const found: string[] = [];
    for (let at = xml.indexOf(open); at >= 0; ) {
      const tag = tagAt(xml, at);
      if (!tag) break;
      found.push(tag);
      at = xml.indexOf(open, at + tag.length);
    }
    return found;
  };
  for (const tag of tags(strFromU8(rels), "<Relationship ")) {
    const id = /\sId="([^"]*)"/.exec(tag)?.[1];
    const target = /\sTarget="([^"]*)"/.exec(tag)?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `ppt/${target}`);
  }
  for (const tag of tags(strFromU8(presentation), "<p:sldId ")) {
    const part = targets.get(/\sr:id="([^"]*)"/.exec(tag)?.[1] ?? "");
    if (part && !order.has(part)) order.set(part, order.size + 1);
  }
  return order;
}

/**
 * Drop a slide's printed number and keep the first copy of its footer and
 * date, the placeholders Docling files as furniture. The number is what
 * `# Slide n` already says; a footer repeated on forty slides is one line of
 * content written forty times, and the first copy keeps it.
 */
function dropSlideChrome(chrome: ReadonlyMap<number, SlideChrome>): (node: OfficeContentNode) => void {
  const seen = new Set<string>();
  return (node) => {
    const own = node.type === "slide" ? chrome.get(node.metadata?.slideNumber ?? -1) : undefined;
    if (!own) return;
    node.children = (node.children ?? []).filter((child) => {
      const text = child.text?.trim() ?? "";
      if (own.number.has(text)) return false;
      if (!own.repeated.has(text)) return true;
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  };
}

/**
 * Write a heading at the level the document declared for it.
 *
 * The text renderer emits a heading as a bare line, so `Annual Review` (H1),
 * `Regional Performance` (H2) and a centred caption are all the same thing by
 * the time anyone reads them: a document's whole hierarchy arrives flat, and
 * with it the answer to which section any paragraph belongs to.
 *
 * `#` repeated, which is what a model already reads as a heading and what the
 * markers for a sheet, a slide and a page are shaped like. Markdown's own
 * renderer is not the answer here even though it gets levels right: it also
 * emits an empty `---`/`---` frontmatter block, hangs `{#anchor}` off every
 * heading and drops sheet names.
 *
 * **A `heading` node is not evidence of a heading.** Only some parsers are told
 * what a heading is; the rest infer one from how big and bold a line looks, and
 * a level guessed that way says nothing. Measured 2026-08-15: the RTF parser
 * called **every** block of a four-paragraph document a level-3 heading, table
 * cells included, so marking those turned `| Region | Q1 |` into
 * `| ### Region | ### Q1 |`; the PDF parser gave a paper's title level 3 on the
 * same font-size reasoning.
 *
 * A named paragraph style is what separates the two: it exists only where the
 * document itself said "this is Heading 2", and no parser invents one. The cost
 * is that OpenDocument declares its levels through `text:h` without a style
 * name, so `.odt` headings stay flat — one Run in sixty days, against the two
 * formats this would otherwise damage.
 *
 * Levels past six are clamped, since `#######` is a heading in no reader, and a
 * document nested that deep has said what it needs to by then.
 */
function markHeadingLevels(): (node: OfficeContentNode) => void {
  const marked = new WeakSet<OfficeContentNode>();

  return (node) => {
    if (node.type !== "heading" || !node.metadata?.style || marked.has(node)) return;
    if (!node.text?.trim()) return;
    marked.add(node);
    const level = Math.min(Math.max(node.metadata.level ?? 1, 1), 6);
    node.children = [{ type: "text", text: `${"#".repeat(level)} ` }, ...(node.children ?? [])];
  };
}

/**
 * Review comments written into the text where they belong (Q24 O1), as
 * `[Comment, author: text]`, and `[Reply, ...]` for an answer in a thread.
 * officeparser keeps them on `node.comments` and its text and csv renderers
 * drop them, as pandoc, docling's markdown and markitdown do by default; Tika,
 * the one reader that keeps them, writes each after the paragraph it is on,
 * after the slide, and with the cell in a sheet. So here: at the end of the
 * paragraph its anchor is in, at the end of a slide, and in a sheet a row of
 * its own after the sheet's last, naming the cell.
 *
 * Seen comments are remembered: a comment over several runs is on each of
 * them, and the renderer visits a node more than once.
 */
function showComments(): { visit: (node: OfficeContentNode) => void; count: () => number } {
  const seen = new Set<OfficeContentNode>();
  const ids = new Set<string>();
  let shown = 0;
  const take = (comments: readonly OfficeContentNode[] | undefined, where = "") =>
    (comments ?? []).flatMap((comment) => {
      // By id too, so a copy of one comment on each run of its range counts once.
      const id = (comment.metadata as { commentId?: string } | undefined)?.commentId;
      if (seen.has(comment) || (id !== undefined && ids.has(id))) return [];
      seen.add(comment);
      if (id !== undefined) ids.add(id);
      const meta = comment.metadata as { author?: string; parentId?: string } | undefined;
      // Folded like a link destination: an author name is the file's to choose,
      // and a line break in it would forge structure in the bundle.
      const fold = (text: string) => text.replace(/\s+/g, " ").trim();
      const author = fold(meta?.author ?? "");
      const raw = comment.children?.length ? comment.children.map(plainText).join("\n") : (comment.text ?? "");
      // Excel opens a note's own text with its author's name and a colon.
      const own = author && raw.startsWith(`${author}:`) ? raw.slice(author.length + 1) : raw;
      const entries = raw.startsWith("[Threaded comment]")
        ? threadEntries(raw)
        : [{ kind: meta?.parentId ? "Reply" : "Comment", author, text: own }];
      return entries.flatMap(({ kind, author, text }) => {
        const body = fold(text);
        if (!body) return [];
        shown++;
        return [`[${[kind, where, author].filter(Boolean).join(", ")}: ${body}]`];
      });
    });
  const below = (node: OfficeContentNode): OfficeContentNode[] =>
    (node.children ?? []).flatMap((child) => [child, ...below(child)]);
  const visit = (node: OfficeContentNode) => {
    if (node.type === "paragraph" || node.type === "heading") {
      const labels = [node, ...below(node)].flatMap((part) => take(part.comments));
      if (labels.length) node.children = [...(node.children ?? []), { type: "text", text: ` ${labels.join(" ")}` }];
    } else if (node.type === "sheet") {
      const labels = below(node).flatMap((cell) => {
        const at = cell.metadata as { row?: number; col?: number } | undefined;
        const address = typeof at?.row === "number" && typeof at.col === "number" ? cellName(at.row, at.col) : "";
        return take(cell.comments, address);
      });
      const rows = labels.map((text): OfficeContentNode => ({ type: "row", children: [{ type: "cell", text, children: [line(text)] }] }));
      if (rows.length) node.children = [...(node.children ?? []), ...rows];
    } else if (node.comments?.length) {
      const labels = take(node.comments);
      if (labels.length) node.children = [...(node.children ?? []), ...labels.map(line)];
    }
  };
  return { visit, count: () => shown };
}

const line = (text: string): OfficeContentNode => ({ type: "paragraph", text, children: [{ type: "text", text }] });
const row = (cells: readonly string[]): OfficeContentNode => ({
  type: "row",
  children: cells.map((text) => ({ type: "cell", text, children: [line(text)] })),
});

/**
 * Put each chart where its node is, as its label line and a table of its data
 * (C6). A deck's chart node names its part and is otherwise empty; an
 * OpenDocument chart is an image or chart node naming its object. A sheet's
 * cell holds an OpenDocument chart where the csv renderer writes no node, so
 * a sheet's charts become rows after its last, as comments do.
 *
 * In an OOXML workbook the sheet pass below writes the charts, so a chart node
 * there (only made when images are extracted) is emptied rather than written
 * twice.
 */
function showCharts(bytes: Uint8Array, workbook: boolean): (node: OfficeContentNode) => void {
  const chart = chartParts(bytes);
  const taken = new WeakSet<OfficeContentNode>();
  const blockOf = (node: OfficeContentNode) => {
    const meta = node.metadata as { attachmentName?: string; altText?: string } | undefined;
    if ((node.type !== "chart" && node.type !== "image") || !meta?.attachmentName || taken.has(node)) return undefined;
    return chart(meta.attachmentName, meta.altText);
  };
  const empty = (node: OfficeContentNode) => {
    taken.add(node);
    Object.assign(node, { type: "drawing", text: "", children: [] });
  };
  const within = (node: OfficeContentNode): OfficeContentNode[] =>
    (node.children ?? []).flatMap((child) => [child, ...within(child)]);
  return (node) => {
    if (node.type === "sheet") {
      const rows = within(node).flatMap((inner) => {
        const block = blockOf(inner);
        if (!block) return [];
        empty(inner);
        return [row([block.label]), ...block.rows.map(row)];
      });
      if (rows.length) node.children = [...(node.children ?? []), ...rows];
      return;
    }
    if (node.type === "chart" && workbook && !taken.has(node)) return empty(node);
    const block = blockOf(node);
    if (!block) return;
    const table: OfficeContentNode[] = block.rows.length ? [{ type: "table", children: block.rows.map(row) }] : [];
    Object.assign(node, { type: "drawing", text: "", children: [line(block.label), ...table] });
  };
}

/**
 * Each sheet's own name and state, and what is drawn on it as rows after its
 * last (C6); a chartsheet, which officeparser gives no node, as a sheet of its
 * own after the rest.
 *
 * officeparser names a sheet by its part's file name alone, so the
 * chartsheet's `sheet1.xml` renamed the first worksheet. It reads worksheets
 * in the package's order; a node whose name is not the one it would give
 * that part is left as it is.
 */
function showWorkbookSheets(content: OfficeContentNode[], bytes: Uint8Array): void {
  const { sheets, order } = workbookSheets(bytes);
  const base = (part: string) => part.slice(part.lastIndexOf("/") + 1);
  const given = new Map(sheets.map((sheet) => [base(sheet.part), sheet.name]));
  const byPart = new Map(sheets.map((sheet) => [sheet.part, sheet]));
  const state = (sheet: { state: number }) => ["", " (hidden)", " (very hidden)"][sheet.state] ?? "";
  const rows = (blocks: readonly ChartBlock[]) => blocks.flatMap((block) => [row([block.label]), ...block.rows.map(row)]);
  content
    .filter((node) => node.type === "sheet")
    .forEach((node, at) => {
      const part = order[at] ?? "";
      const sheet = byPart.get(part);
      const meta = node.metadata as { sheetName?: string } | undefined;
      if (!sheet || meta?.sheetName !== (given.get(base(part)) ?? base(part))) return;
      node.metadata = { ...meta, sheetName: `${sheet.name}${state(sheet)}` };
      node.children = [...(node.children ?? []), ...rows(sheet.blocks)];
    });
  for (const sheet of sheets) {
    if (sheet.chartsheet) content.push({ type: "sheet", metadata: { sheetName: `${sheet.name} (chart)${state(sheet)}` }, children: rows(sheet.blocks) });
  }
}

// A threaded comment reaches the legacy note part only as Excel's fallback
// text: a boilerplate paragraph, then each message after a "Comment:" or
// "Reply:" line. The note's author there is the thread id, never a person.
function threadEntries(raw: string): { kind: string; author: string; text: string }[] {
  const parts = raw.split(/\n[ \t]*(Comment|Reply):[ \t]*\r?\n/);
  const entries: { kind: string; author: string; text: string }[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) entries.push({ kind: parts[i], author: "", text: parts[i + 1] });
  return entries;
}

/** `B3` for row 2, column 1, both counted from 0. */
function cellName(row: number, col: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return `${name}${row + 1}`;
}

/**
 * A table inside a table cell, read as one line of that cell's text: rows
 * apart by `; `, cells by ` / `. The text renderer otherwise writes the inner
 * cells into the outer row as columns of their own, and every cell after them
 * lands under the wrong header. Docling flattens a nested table into its
 * cell's text the same way; a pipe table has no syntax for one inside another.
 */
function flattenNestedTables(node: OfficeContentNode): void {
  if (node.type !== "cell" || !node.children?.some((child) => child.type === "table")) return;
  node.children = node.children.map((child) => {
    if (child.type !== "table") return child;
    const text = plainText(child).trim();
    return { type: "paragraph", text, children: [{ type: "text", text }] };
  });
}

const PLAIN_SEPARATOR: Readonly<Record<string, string>> = { table: "; ", row: " / ", cell: " " };

/** A node's text with a table's rows and cells kept apart, empty ones left out. */
function plainText(node: OfficeContentNode): string {
  if (!node.children?.length) return node.text ?? "";
  const separator = PLAIN_SEPARATOR[node.type];
  if (separator === undefined) return node.children.map(plainText).join("");
  return node.children
    .map((child) => plainText(child).trim())
    .filter(Boolean)
    .join(separator);
}

/**
 * Give a horizontally merged cell the columns it actually covers.
 *
 * A cell spanning three columns is a single child of its row, and the renderer
 * lays a table out by position, so the row arrives one cell wide inside a three
 * column table: `| Half-year totals |` sitting above `| Segment | Revenue |
 * Cost |`. What comes out is not a parseable table at all, and a model aligning
 * columns by position reads the merged heading as a value in the first column
 * and finds no data for the other two. Merged header cells are ordinary in real
 * business documents.
 *
 * The covered columns are filled with empty cells rather than with a repeat of
 * the value, because that is what the document says: one heading standing over
 * three columns, not the same heading three times.
 *
 * Only the span is trusted. The cells of a row that continues a *vertical*
 * merge carry column indices one past where they sit, so `metadata.col` cannot
 * be used to place anything.
 *
 * Rows are remembered because the renderer visits each one **twice** — once
 * walking the table's children, and again inside its own table layout pass —
 * and a second expansion would pad the row to five columns instead of three.
 */
/**
 * Give a PDF table row back the slots its empty cells held (pdf-1.2).
 *
 * A PDF has no cells, so officeparser recovers a table from positions and
 * gives each cell the column it sits in (`metadata.col`); an empty cell has no
 * glyphs and no node, and the renderer writes the cells there are in order.
 * "APAC | 980 | (empty) | 980" then read as "| APAC | 980 | 980 |", the total
 * taken for Q2. Only for a PDF: the office parsers number `col` their own way
 * (RTF always 0) and write their empty cells as nodes.
 *
 * Runs before {@link expandMergedCells}, so a merged cell's span counts as the
 * columns it covers. A row gets at most MAX_EMPTY_SLOTS of them, so crafted
 * column numbers cannot make a row of millions of cells.
 */
function keepEmptyCellSlots(node: OfficeContentNode): void {
  if (node.type !== "row" || !node.children) return;
  const kept: OfficeContentNode[] = [];
  let next = 0;
  let padded = 0;
  for (const cell of node.children) {
    const col = cell.type === "cell" ? cell.metadata?.col : undefined;
    for (let at = next; typeof col === "number" && at < col && padded < MAX_EMPTY_SLOTS; at++, padded++) {
      kept.push({ type: "cell", text: "" });
    }
    kept.push(cell);
    next = (typeof col === "number" ? Math.max(col, next) : next) + (cell.type === "cell" ? (cell.metadata?.colSpan ?? 1) : 1);
  }
  if (kept.length !== node.children.length) node.children = kept;
}

const MAX_EMPTY_SLOTS = 100;

function expandMergedCells(): (node: OfficeContentNode) => void {
  const expandedRows = new WeakSet<OfficeContentNode>();

  return (node) => {
    if (node.type !== "row" || !node.children || expandedRows.has(node)) return;
    expandedRows.add(node);

    const expanded: OfficeContentNode[] = [];
    for (const cell of node.children) {
      expanded.push(cell);
      const span = cell.type === "cell" ? (cell.metadata?.colSpan ?? 1) : 1;
      for (let covered = 1; covered < span; covered++) expanded.push({ type: "cell", text: "" });
    }
    if (expanded.length !== node.children.length) node.children = expanded;
  };
}

/**
 * Write each external link as `[text](url)`, the Markdown link the HTML and
 * RTF readers already write (Q32 O1).
 *
 * The parsed tree keeps the URL on each run (`metadata.link`), and the text
 * renderer emits only the run's characters, so `our documentation` reaches the
 * bundle with nothing saying it pointed anywhere. A link of several runs (a
 * bold word inside it) is one link: consecutive runs with the same address
 * are wrapped together, at the node that holds them.
 *
 * A link whose text already is its destination is left alone, since repeating
 * it adds nothing; a run is wrapped once, so running this twice changes
 * nothing. Internal links (`#anchor`) are skipped: they name a position in the
 * same document, and flat text has nowhere to point.
 */
function showLinkDestinations(node: OfficeContentNode): void {
  const children = node.children ?? [];
  const link = (child: OfficeContentNode | undefined) =>
    child?.type === "text" && child.metadata?.linkType === "external" && !wrapped.has(child) ? child.metadata.link : undefined;
  for (let from = 0; from < children.length; from++) {
    const target = link(children[from]);
    if (!target) continue;
    let to = from;
    while (link(children[to + 1]) === target) to++;
    const runs = children.slice(from, to + 1);
    runs.forEach((run) => wrapped.add(run));
    const text = runs.map((run) => run.text ?? "").join("");
    from = to;
    if (!linkWorthWriting(text, target)) continue;
    // Folded like the renderer's own metadata header: the URL is document-supplied
    // and a line break in it would forge structure in a bundle a model reads as
    // one document. A real URL has no whitespace to lose.
    runs[0]!.text = `[${runs[0]!.text ?? ""}`;
    runs[runs.length - 1]!.text = `${runs[runs.length - 1]!.text ?? ""}](${target.replace(/\s+/g, "")})`;
  }
}

/** Runs already written as part of a link. */
const wrapped = new WeakSet<OfficeContentNode>();

/**
 * Put a word processor document's page header and footer back into the text.
 *
 * They are parsed, and then set aside: the tree keeps them out of the main flow
 * as `auxiliary`, and the text renderer walks only the flow. So a document
 * stamped `CONFIDENTIAL - Internal Distribution Only` on every page arrives
 * with no trace of it. That is the worse half of a contradiction the two paths
 * used to have — a PDF repeated the same furniture at every seam while a docx
 * silently discarded a confidentiality marking.
 *
 * Written once, labelled, in the same `--- … ---` shape the renderer already
 * uses for collected notes. Once rather than per page because a word processor
 * document has no pages until something lays it out, and because a repeat is
 * exactly what the PDF path just stopped doing.
 *
 * Word writes up to three headers per section (default, first page, even
 * pages) and more for a document with several, so identical ones are collapsed.
 * A footer's page number is a field the reader computes rather than text, so
 * what survives of `Page 3` is `Page`: worth writing, since the alternative is
 * a document that never mentions a footer at all, but not worth pretending is
 * the whole of it.
 */
function includePageFurniture(
  content: OfficeContentNode[],
  auxiliary: { headers?: OfficeContentNode[]; footers?: OfficeContentNode[] } | undefined,
): void {
  const labelled = (label: string, nodes: readonly OfficeContentNode[]): OfficeContentNode[] => {
    const seen = new Set<string>();
    // Compared with runs of whitespace folded, so a line read by officeparser
    // and the same line read by `odfPageFurniture` are one.
    const lines = nodes.filter((node) => {
      const text = node.text?.replace(/\s+/g, " ").trim();
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
    if (lines.length === 0) return [];
    return [
      { type: "paragraph", text: label, children: [{ type: "text", text: label }] },
      ...lines,
    ];
  };

  content.unshift(...labelled("--- Page header ---", auxiliary?.headers ?? []));
  content.push(...labelled("--- Page footer ---", auxiliary?.footers ?? []));
}

/**
 * officeparser's ODT header and footer with every other one the file prints
 * after them (C7): first-page, left-page and other master pages' ones.
 */
function withOdfFurniture(
  auxiliary: { headers?: OfficeContentNode[]; footers?: OfficeContentNode[] } | undefined,
  bytes: Uint8Array,
): { headers: OfficeContentNode[]; footers: OfficeContentNode[] } {
  const more = odfPageFurniture(bytes);
  return {
    headers: [...(auxiliary?.headers ?? []), ...more.headers.map(line)],
    footers: [...(auxiliary?.footers ?? []), ...more.footers.map(line)],
  };
}

/** How long a line may be and still be taken for a page-number footer. */
const FURNITURE_LINE_LIMIT = 80;

/** The first and last content-bearing children of a page, which is where furniture sits. */
function edgesOf(page: OfficeContentNode): { first?: OfficeContentNode; last?: OfficeContentNode } {
  const lines = (page.children ?? []).filter((child) => child.text?.trim());
  return { first: lines[0], last: lines[lines.length - 1] };
}

/**
 * Thin out the running header and footer a paginated document repeats.
 *
 * A forty-page report writes its title and a page number into the text forty
 * times each, at every page seam, so a paragraph continuing across a break is
 * cut in half by a line belonging to neither side of it. None of it is content;
 * all of it is read as content.
 *
 * Two rules, and both are chosen so that being wrong costs nothing:
 *
 * - **An identical line at the same page edge keeps its first occurrence and
 *   loses the repeats.** Dropping a byte-identical copy of a string that is
 *   still present cannot lose information, whatever the line turns out to be —
 *   so this needs no judgement about whether it was really furniture. It is
 *   deduplication, not detection.
 * - **A line carrying the page's own number is dropped outright**, since that is
 *   what `# Page n` now says, and says better. This one *is* a judgement, so it
 *   is made narrow: the line has to be short, and the pattern has to hold on
 *   all but at most one page (a cover page usually carries no footer). A stray
 *   sentence mentioning a number cannot satisfy that across a whole document.
 *
 * Under three pages nothing is touched. Two pages sharing an edge line is
 * coincidence often enough to matter, and the noise being fought does not exist
 * at that length anyway.
 */
function dropRunningFurniture(content: readonly OfficeContentNode[]): void {
  const pages = content.filter((node) => node.type === "page");
  const doomed = runningFurniture(
    pages.map((page, index) => ({ number: page.metadata?.pageNumber ?? index + 1, ...edgesOf(page) })),
    (node) => node.text!,
  );
  if (doomed.size === 0) return;
  for (const page of pages) {
    page.children = (page.children ?? []).filter((child) => !doomed.has(child));
  }
}

/**
 * The edge lines that carry a printed page number, each with the line's text
 * minus that number, or nothing when the edge has no folio.
 *
 * The printed number may run a constant `k` ahead of or behind the page index,
 * since a cover and a contents page usually go unnumbered. When `k` is not 0 the
 * number must stand where a folio stands (at the start or end of the line, or
 * after "Page"), so `Section 5: Part` heading three pages in a row is not taken
 * for one. The folio has to hold on all but one page from where it first
 * appears to the end. A number is a whole number: page 1 must not match the `1`
 * in `2015`.
 */
function folios<T>(
  lines: readonly { line: T; text: string; number: number }[],
): { line: T; rest: string }[] | undefined {
  const byOffset = new Map<number, Map<number, { line: T; rest: string }>>();
  lines.forEach(({ line, text, number }, at) => {
    if (text.trim().length > FURNITURE_LINE_LIMIT) return;
    for (const match of text.matchAll(/(?<!\d)\d{1,5}(?!\d)/g)) {
      const k = Number(match[0]) - number;
      const before = text.slice(0, match.index);
      const after = text.slice(match.index + match[0].length);
      const folio = /^[^\p{L}\p{N}]*$/u.test(before) || /^[^\p{L}\p{N}]*$/u.test(after) || /\bp(?:age|g)?\.?\s*$/i.test(before);
      if (k !== 0 && !folio) continue;
      const group = byOffset.get(k) ?? new Map();
      if (!group.has(at)) group.set(at, { line, rest: before + after });
      byOffset.set(k, group);
    }
  });
  for (const group of byOffset.values()) {
    // Keys go in in page order, so the first is where the folio first appears.
    const span = lines.length - group.keys().next().value!;
    if (group.size >= 3 && group.size >= span - 1) return [...group.values()];
  }
  return undefined;
}

/**
 * The edge lines {@link dropRunningFurniture}'s two rules remove, for any
 * reader that can say which line opens and which closes each page. Shared so a
 * PDF read by liteparse is thinned the same way as one read by officeparser.
 */
function runningFurniture<T>(
  pages: readonly { number: number; first?: T; last?: T }[],
  text: (line: T) => string,
): Set<T> {
  const doomed = new Set<T>();
  if (pages.length < 3) return doomed;

  for (const edge of ["first", "last"] as const) {
    const lines = pages.flatMap((page) => {
      const line = page[edge];
      return line === undefined ? [] : [{ line, text: text(line), number: page.number }];
    });

    const numbered = folios(lines);
    if (numbered) {
      // The number is what `# Page n` now says. Words beside it (a title, a
      // chapter name) keep their first copy, as the identical-line rule would.
      const seen = new Set<string>();
      for (const { line, rest } of numbered) {
        const key = rest.replace(/\s+/g, " ").trim();
        if (/\p{L}/u.test(key.replace(/\b(?:page|pg|p|of)\b/gi, "")) && !seen.has(key)) seen.add(key);
        else doomed.add(line);
      }
      continue;
    }

    const byText = new Map<string, T[]>();
    for (const { line, text } of lines) {
      const key = text.trim().replace(/\s+/g, " ");
      byText.set(key, [...(byText.get(key) ?? []), line]);
    }
    for (const repeats of byText.values()) {
      if (repeats.length >= 3) for (const line of repeats.slice(1)) doomed.add(line);
    }
  }
  return doomed;
}

/**
 * Number each footnote reference where it stands, and label its body to match.
 *
 * The tree attaches a note to the exact run that referenced it. The text
 * renderer collects every note body under `--- Notes ---`, which is worth
 * keeping, but drops the marker — so nothing says which note belongs to which
 * claim, and two notes against two claims leave a model attributing them by
 * coin flip.
 *
 * A slide's speaker notes are not footnotes: they carry no `noteType` and are
 * rendered under their own slide rather than collected, so they are left alone.
 *
 * Keys are assigned in reference order rather than taken from the document,
 * because footnotes and endnotes are numbered in separate sequences and both
 * can carry id `1`. The note objects themselves key the map: the renderer
 * collects those same objects, so a body is matched to its reference by
 * identity rather than by anything the document supplied.
 */
function numberFootnotes(): (node: OfficeContentNode) => void {
  const keys = new Map<OfficeContentNode, string>();
  let assigned = 0;

  return (node) => {
    if (node.type === "note") {
      const key = keys.get(node);
      if (!key) return;
      keys.delete(node);
      // Inside the note's first paragraph, where officeparser 8 puts its text,
      // so the label opens the line instead of standing on one of its own.
      const first = node.children?.[0];
      // Word opens a note's text with a space of its own.
      const spaced = /^\s/.test(first?.children?.[0]?.text ?? first?.text ?? "");
      const label: OfficeContentNode = { type: "text", text: spaced ? `[^${key}]` : `[^${key}] ` };
      if (first && first.type !== "text" && first.children) first.children = [label, ...first.children];
      else node.children = [label, ...(node.children ?? [])];
      return;
    }

    let markers = "";
    for (const note of node.notes ?? []) {
      if (note.type !== "note" || !note.metadata?.noteType || keys.has(note)) continue;
      const key = String((assigned += 1));
      keys.set(note, key);
      markers += `[^${key}]`;
    }
    if (!markers) return;

    // A reference usually follows a run of text and belongs at its end. When it
    // opens a paragraph there is no run to append to, so the marker becomes a
    // child of its own — a block node renders its children, never its `text`.
    if (node.type === "text") node.text = `${node.text ?? ""}${markers}`;
    else node.children = [...(node.children ?? []), { type: "text", text: markers }];
  };
}

/**
 * Each docx list item as a line opening with its label, indented four spaces
 * a level as officeparser indents it. officeparser's renderer writes its own
 * "1." or "-" in front of a list node, so a labelled item becomes a paragraph.
 * Walked once before rendering: the labels count items in document order, and
 * the renderer visits a node more than once.
 */
function labelWordLists(content: readonly OfficeContentNode[], bytes: Uint8Array): void {
  const label = wordListLabels(bytes);
  if (!label) return;
  const walk = (nodes: readonly OfficeContentNode[]) => {
    for (const node of nodes) {
      const meta = node.metadata as { listId?: string; indentation?: number } | undefined;
      const level = meta?.indentation ?? 0;
      const text = node.type === "list" && meta?.listId !== undefined ? label(meta.listId, level) : undefined;
      if (text !== undefined) {
        node.type = "paragraph";
        node.children = [{ type: "text", text: `${"    ".repeat(level)}${text ? `${text} ` : ""}` }, ...(node.children ?? [])];
      }
      walk(node.children ?? []);
    }
  };
  walk(content);
}

function toLibraryConfig(options: OfficeParserOptions): Record<string, unknown> {
  // A PDF is read as a flow of pages, not laid out from its geometry (8.x's
  // default): that layout drops the page nodes our passes key on, and the
  // flow reader orders columns and recovers positioned tables on its own.
  const config: Record<string, unknown> = { ignorePageGeometry: true };
  if (options.pdfWorkerSrc) config.pdfWorkerSrc = options.pdfWorkerSrc;
  // Only the variants need translating; a base format sniffs the same either
  // way, and leaving it to the library keeps that path exactly as it was.
  if (options.format && LIBRARY_FILE_TYPE[options.format]) {
    config.fileType = LIBRARY_FILE_TYPE[options.format];
  }
  // Set at the top level rather than inside `ocrConfig`: the library copies it
  // down into the recogniser itself, and passing it here also aborts the parse
  // around the recognition instead of only the pages.
  if (options.abortSignal) config.abortSignal = options.abortSignal;
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
 * True when a document could not be opened because it is encrypted.
 *
 * Worth telling apart from every other reason a reader can fail, because it is
 * the only one the person holding the file can do something about: "couldn't
 * extract text" is a dead end, "password protected" is an instruction. It also
 * separates the two populations behind `extract_failed` — a locked document is
 * never a scan, so recognition can never rescue one.
 *
 * The message is the only signal available. `officeparser` throws a bare
 * `Error` here with no `officeIssue` code and no `cause` (measured 2026-08-15
 * against 7.6.1), and the readable half of the wording comes from pdf.js rather
 * than from officeparser at all. Matching on it belongs here, beside the
 * library call, rather than in each platform that catches the throw.
 */
export function isPasswordProtected(error: unknown): boolean {
  return error instanceof Error && /password/i.test(error.message);
}

/**
 * A C0 control character, tab and the line breaks excepted. Nothing writes one
 * into a document on purpose.
 */
function undecodable(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    const code = line.charCodeAt(index);
    // Tab, newline and carriage return are the three that mean something.
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
  }
  return false;
}

/**
 * Leave out the stretches of text that came back as characters nobody can
 * read, keeping the readable words around them on the same line.
 *
 * A PDF stores a character as a number and leaves it to the font to say which
 * letter that number is. When the font carries no such map — no `/ToUnicode`,
 * and codes that are really glyph numbers — a reader has nothing to decode
 * with, and every reader available answers with the numbers read as if they
 * were letters. Measured 2026-08-16 on a real Turkish government document:
 * `pypdf` produced the identical mess from the identical bytes, so this is the
 * file rather than our reader, and the embedded fonts do carry the map that
 * would fix it. Nothing exposed to us reaches it.
 *
 * The tell is that the space glyph is mapped away with everything else, so it
 * arrives as a control character rather than a space. That is the signal used
 * here: measured across all 24 documents of the extraction corpus not one
 * carries a single control character, and the real document carries 130, on
 * lines holding 89% of its text.
 *
 * Left out rather than passed on, because unreadable text that *looks* like
 * text is worse than an absence: a model reads it, believes it, and answers
 * from it. What survives is the part that decoded, which is usually the plain
 * ASCII a document's identifiers are written in.
 */
function dropUndecodableLines(text: string): { text: string; lost: number; pages: number[] } {
  if (!undecodable(text)) return { text, lost: 0, pages: [] };
  // Which pages the loss landed on, so a caller that can read a page another way
  // re-reads those and leaves every other page at the exact text this extraction
  // already produced. A page counts as past reading when it lost more characters
  // than it kept: below that the page still reads, and re-reading it would trade
  // the document's own characters for a recogniser's near-miss. Characters, not
  // lines, since officeparser 8 hands a PDF back a paragraph to a line.
  // ponytail: a majority is the whole threshold. `extract_note` counts these per
  // document, so it can be moved once there is more than one broken document to
  // move it against.
  const tally = new Map<number, { kept: number; lost: number }>();
  const kept: string[] = [];
  let lost = 0;
  let page = 0;
  for (const line of text.split("\n")) {
    const marker = /^# Page (\d+)$/.exec(line);
    if (marker) page = Number(marker[1]);
    const part = undecodable(line) ? decodedPart(line) : { kept: line, lost: 0 };
    if (part.lost > 0) lost++;
    if (part.lost === 0 || part.kept) kept.push(part.kept);
    // Blank lines and our own markers are neither evidence of reading nor of
    // loss, and a heading-only page must not read as a page that survived.
    // Page 0 is whatever preceded the first marker, which belongs to no page.
    if (marker || !line.trim() || line.startsWith("#")) continue;
    const counts = tally.get(page) ?? { kept: 0, lost: 0 };
    counts.kept += part.kept.length;
    counts.lost += part.lost;
    tally.set(page, counts);
  }
  const pages = [...tally]
    .filter(([number, counts]) => number > 0 && counts.lost > counts.kept)
    .map(([number]) => number);

  // Our own page and heading markers are all that can be left when a document
  // decoded nowhere. Answering with those is the silent success ADR-0003 exists
  // to prevent, so this is the empty case instead.
  const survives = kept.some((line) => line.trim() && !line.startsWith("#"));
  return { text: survives ? kept.join("\n").trim() : "", lost, pages };
}

/**
 * A line less its undecodable stretch: from the first word holding a control
 * character to the last, so a decoded identifier beside it survives. A broken
 * run's own spaces are control characters, so the stretch is one piece.
 */
function decodedPart(line: string): { kept: string; lost: number } {
  let first = -1;
  let last = -1;
  for (let index = 0; index < line.length; index++) {
    if (undecodable(line[index])) {
      if (first < 0) first = index;
      last = index;
    }
  }
  const space = (char: string | undefined) => char === " " || char === "\t";
  while (first > 0 && !space(line[first - 1])) first--;
  while (last + 1 < line.length && !space(line[last + 1])) last++;
  const before = line.slice(0, first).trimEnd();
  const after = line.slice(last + 1).trimStart();
  return { kept: before && after ? `${before} ${after}` : before || after, lost: last + 1 - first };
}

/**
 * Put a re-read page back into an extraction, under the `# Page n` marker it
 * belongs to.
 *
 * Recognition can read a page whose fonts carry no character map, but only that
 * page: the rest of the document decoded exactly and OCR would only make it
 * worse. So a rescue replaces sections rather than documents, and this is where
 * the marker convention `markSectionStarts` writes is read back — the two have
 * to move together, which is why they live in the same file.
 *
 * A page number with no marker in the text is ignored rather than appended: it
 * would put text where the document does not have a page.
 */
export function replacePages(text: string, replacements: ReadonlyMap<number, string>): string {
  if (replacements.size === 0) return text;
  const out: string[] = [];
  let dropping = false;
  for (const line of text.split("\n")) {
    const marker = /^# Page (\d+)$/.exec(line);
    if (marker) {
      const replacement = replacements.get(Number(marker[1]));
      dropping = replacement !== undefined;
      out.push(line);
      if (replacement !== undefined && replacement.trim()) out.push(replacement.trim());
      continue;
    }
    if (!dropping) out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * One page of a PDF that a platform's own reader read (the web's liteparse),
 * numbered from 1 in file order. `scanned` is the reader's word that the page
 * holds a picture, which is what tells a scanned page from a blank one: both
 * carry no text.
 */
export interface PdfPage {
  number: number;
  text: string;
  scanned?: boolean;
  /** The alternative text of the page's tagged figures. */
  figures?: string[];
  /** Review comments on the page; `anchor` is the text a highlight or other text markup covers. */
  comments?: { author?: string; text: string; anchor?: string }[];
}

/**
 * Give a PDF read page by page elsewhere the shape {@link extractOfficeDocument}
 * gives one: a `# Page n` line over each page, unreadable lines left out under a
 * `text-undecodable` note, and `""` when no page carries a letter or a digit.
 *
 * A page with a picture and nothing readable, in a document whose other pages
 * read, is listed in a `pages-scanned` note so recognition re-reads it the way
 * it re-reads an undecodable one. Kreuzberg OCRs a page with no letter or digit
 * and Tika's AUTO one with ten characters or fewer; the picture is our addition,
 * so a blank page in a text PDF never starts a recognition pass.
 *
 * In a document no page of which reads, every page is listed, picture or not:
 * the whole document goes to recognition either way, and drawing the page is
 * the route that reads it. officeparser's own recognition, the other one,
 * decodes no JBIG2 or JPEG 2000 picture (38 of 181 olmOCR-bench scan pages read
 * nothing there), and liteparse's picture reasons missed 1 of those 181.
 */
export function assemblePdfPages(pages: readonly PdfPage[], skipped = 0): ExtractionResult {
  const readable = (text: string) => /[\p{L}\p{N}]/u.test(text);
  // liteparse writes an empty ```text fence for a page with no text.
  const trimmed = pages.map((page) => ({
    ...page,
    lines: page.text.replace(/^```text\s*```$/gm, "").trim().split("\n"),
  }));
  // Running headers and footers, under the rules officeparser's PDFs get. The
  // reader keeps them (`keepHeadersFooters`), because its own stripping drops
  // every copy and with it a title or marking printed only there.
  const edges = trimmed.map((page) => {
    const filled = page.lines.map((text, at) => ({ text, at })).filter((line) => line.text.trim());
    return { number: page.number, first: filled[0], last: filled[filled.length - 1] };
  });
  const furniture = runningFurniture(edges, (line) => line.text);
  const bodies = trimmed.map((page, index) => {
    const { first, last } = edges[index];
    const drop = new Set([first, last].flatMap((line) => (line && furniture.has(line) ? [line.at] : [])));
    return { ...page, text: page.lines.filter((_, at) => !drop.has(at)).join("\n").trim() };
  });
  const notes: ExtractionNote[] = skipped > 0 ? [{ kind: "pages-skipped", count: skipped }] : [];
  const empty = (text: string) => (notes.length > 0 ? { text, notes } : { text });
  const anyReadable = bodies.some((page) => readable(page.text));
  const scans = bodies
    .filter((page) => !anyReadable || (page.scanned && !readable(page.text)))
    .map((page) => page.number);
  const scanned = () => {
    if (scans.length > 0) notes.push({ kind: "pages-scanned", count: scans.length, pages: scans });
  };
  if (!anyReadable) {
    scanned();
    return empty("");
  }

  // A figure's alternative text after its page's text (Q31 O1), kept out of
  // the readable test so it cannot stand in for a scanned page's text.
  // ponytail: not where the figure sits; liteparse's text items carry no
  // marked-content id to place it by.
  let comments = 0;
  const marked = bodies
    .map((page) => {
      const figures = (page.figures ?? []).map((alt) => altLabel("Image", [alt])).filter(Boolean);
      const { text, after, count } = withPdfComments(page.text, page.comments ?? []);
      comments += count;
      return [`# Page ${page.number}`, [text, [...figures, ...after].join("\n")].filter(Boolean).join("\n\n")].filter(Boolean).join("\n");
    })
    .join("\n\n");
  if (comments > 0) notes.push({ kind: "comments-included", count: comments });
  const { text, lost, pages: lostPages } = dropUndecodableLines(marked);
  if (lost > 0) {
    notes.push({
      kind: "text-undecodable",
      count: lost,
      ...(lostPages.length > 0 ? { pages: lostPages } : {}),
    });
  }
  scanned();
  return empty(text);
}

/**
 * A PDF page's review comments as `[Comment, author: text]` (Q24 O1): right
 * after the words a highlight covers when they occur once on the page, and
 * after the page's text otherwise, where Tika writes every one and all a
 * sticky note's margin icon gives to place it by.
 */
function withPdfComments(text: string, comments: NonNullable<PdfPage["comments"]>): { text: string; after: string[]; count: number } {
  // An author name and a note are the file's to choose; a line break in either
  // would forge structure in the bundle.
  const fold = (value = "") => value.replace(/\s+/g, " ").trim();
  const after: string[] = [];
  let count = 0;
  for (const comment of comments) {
    if (!fold(comment.text)) continue;
    count++;
    const label = `[Comment${fold(comment.author) ? `, ${fold(comment.author)}` : ""}: ${fold(comment.text)}]`;
    const anchor = fold(comment.anchor);
    const at = anchor ? text.indexOf(anchor) : -1;
    if (at >= 0 && at === text.lastIndexOf(anchor)) text = `${text.slice(0, at + anchor.length)} ${label}${text.slice(at + anchor.length)}`;
    else after.push(label);
  }
  return { text, after, count };
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
  const { bytes: readable, hidden: hiddenRuns, slides: hiddenSlides } = withoutHiddenText(bytes);
  const ast = await parseOffice(withChartTables(readable).bytes, toLibraryConfig(options));
  // Recognised image text reaches us as `[Image: …]` placeholders in the
  // rendered string, and csv has nowhere to write them. A workbook that carries
  // any is therefore rendered as text: its cells run together, exactly as they
  // did before this choice existed, but nothing OCR recovered is thrown away.
  const carriesOcrText = (ast.attachments ?? []).some((image) => image.ocrText?.trim());
  // A page node carries the text of everything under it, so this answers "did
  // any page of this PDF yield anything" without walking the tree. Read before
  // the furniture pass, which only ever removes lines.
  const anyPageHasText = ast.content.some((node) => node.type === "page" && !!node.text?.trim());
  // Decided before anything is added to the tree, so which renderer runs can
  // never depend on what we put there.
  const asWorkbook = isWorkbook(ast.content) && !carriesOcrText;
  // Two passes over the whole tree rather than visitors: one compares pages
  // against each other, and the other reaches content that is not in the tree
  // the renderer walks at all. Neither has anything to say about a workbook,
  // and the csv renderer would write a paragraph of ours as a row.
  if (!asWorkbook) {
    dropRunningFurniture(ast.content);
    includePageFurniture(ast.content, ast.type === "odt" ? withOdfFurniture(ast.auxiliary, bytes) : ast.auxiliary);
  }
  if (isWorkbook(ast.content)) showWorkbookSheets(ast.content, bytes);
  // An ODS sheet's print header and footer as rows after its own (Q27 O1).
  if (ast.type === "ods") {
    const furniture = odsSheetFurniture(readable);
    for (const node of ast.content) {
      const lines = node.type === "sheet" ? furniture.get((node.metadata as { sheetName?: string } | undefined)?.sheetName ?? "") : undefined;
      if (lines) node.children = [...(node.children ?? []), ...lines.map((text) => row([text]))];
    }
  }
  // A Word list item opens with the label Word prints for it (C8).
  if (ast.type === "docx") labelWordLists(ast.content, readable);
  // What a deck's masters and layouts print on every slide, once at the top (Q28 O1).
  if (ast.content.some((node) => node.type === "slide")) {
    const master = slideMasterText(readable);
    if (master.length) ast.content.unshift(line("--- Slide master ---"), ...master.map(line));
  }
  // Each visitor restores one thing the text renderer drops. They are composed
  // rather than merged because they are independent of one another and of the
  // node types they act on.
  const chrome = ast.content.some((node) => node.type === "slide") ? slideChrome(bytes) : new Map<number, SlideChrome>();
  const hidden = new Set([...hiddenSlides, ...[...chrome].flatMap(([number, slide]) => (slide.hidden ? [number] : []))]);
  const comments = showComments();
  const charts = showCharts(bytes, isWorkbook(ast.content));
  const sheetVisitors = [expandMergedCells(), charts, comments.visit];
  const visitors = [
    dropSlideChrome(chrome),
    markSectionStarts(anyPageHasText, hidden),
    dropSlideNumberFromNotes,
    labelSpeakerNotes,
    markHeadingLevels(),
    numberFootnotes(),
    showLinkDestinations,
    flattenNestedTables,
    ...(ast.type === "pdf" ? [keepEmptyCellSlots] : []),
    expandMergedCells(),
    charts,
    comments.visit,
  ];
  // The parse's own warnings (a page that failed, the CDN fallback) live on the
  // AST, and `.to(…)` hands back only the renderer's; taken before rendering,
  // as officeparser's own converter does, since the AST then collects the
  // renderer's too.
  const parsed = [...(ast.warnings ?? [])];
  const { value, messages } = asWorkbook
    ? await ast.to("csv", {
        onNode: (node) => {
          for (const visit of sheetVisitors) visit(node);
        },
      })
    : await ast.to("text", {
        onNode: (node) => {
          for (const visit of visitors) visit(node);
        },
      });
  // Only the pdf and csv renderers can answer with bytes; both of ours are
  // string-shaped, so this narrows a union rather than handling a real case.
  const rendered = typeof value === "string" ? value : new TextDecoder().decode(value);
  const resolved = resolveImagePlaceholders(rendered, ast.attachments ?? []).trim();
  const { text, lost, pages } = dropUndecodableLines(resolved);
  const notes = toNotes([...parsed, ...messages]);
  if (lost > 0) {
    notes.push({ kind: "text-undecodable", count: lost, ...(pages.length > 0 ? { pages } : {}) });
  }
  if (hiddenRuns > 0) notes.push({ kind: "hidden-left-out", count: hiddenRuns });
  if (comments.count() > 0) notes.push({ kind: "comments-included", count: comments.count() });
  // officeparser leaves RTF's info group unread, and a PDF's title is read
  // the way the web's first PDF reader reads it, so both platforms agree.
  const title = ast.type === "rtf" ? rtfTitle(bytes) : ((ast.type === "pdf" && pdfTitle(bytes)) || ast.metadata?.title);
  const result: ExtractionResult = { text, ...(notes.length > 0 ? { notes } : {}), ...(title ? { title } : {}) };
  // Only a PDF has pages here.
  return ast.content.some((node) => node.type === "page") ? noteLayersOff(result, bytes) : result;
}
