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
function markSectionStarts(markPages: boolean): (node: OfficeContentNode) => void {
  const seen = { slide: 0, page: 0 };

  return (node) => {
    // The library's own number is the truthful one when it has it; the counters
    // cover a document whose sections carry no metadata.
    let label;
    if (node.type === "slide") {
      seen.slide += 1;
      label = `# Slide ${node.metadata?.slideNumber ?? seen.slide}`;
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
 * Write each external link's destination after the text that carried it.
 *
 * The parsed tree keeps the URL on the run (`metadata.link`), and the text
 * renderer emits only the run's characters, so `our documentation` reaches the
 * bundle with nothing saying it pointed anywhere. Every reference in a linked
 * document is then unrecoverable, and invisibly so: a model asked what a
 * document cites can only answer from the anchor text.
 *
 * A run whose text already contains its destination is left alone, since
 * repeating it adds nothing — which also makes this safe to run twice over the
 * same tree. Internal links (`#anchor`) are skipped: they name a position in
 * the same document, and flat text has nowhere to point.
 */
function showLinkDestinations(node: OfficeContentNode): void {
  if (node.type !== "text" || node.metadata?.linkType !== "external") return;
  const link = node.metadata.link;
  if (!link || !node.text || node.text.includes(link)) return;
  // Folded like the renderer's own metadata header: the URL is document-supplied
  // and a line break in it would forge structure in a bundle a model reads as
  // one document. A real URL has no whitespace to lose.
  node.text = `${node.text} (${link.replace(/\s+/g, "")})`;
}

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
    const lines = nodes.filter((node) => {
      const text = node.text?.trim();
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
  if (pages.length < 3) return;

  const doomed = new Set<OfficeContentNode>();

  for (const edge of ["first", "last"] as const) {
    const lines = pages
      .map((page, index) => ({
        page,
        node: edgesOf(page)[edge],
        number: page.metadata?.pageNumber ?? index + 1,
      }))
      .filter((line) => line.node !== undefined);

    // Its own page number, as a whole number rather than as digits inside a
    // longer one: page 1 must not match the `1` in `2015`.
    const numbered = lines.filter(
      (line) =>
        line.node!.text!.trim().length <= FURNITURE_LINE_LIMIT &&
        new RegExp(`(?:^|\\D)${line.number}(?:\\D|$)`).test(line.node!.text!),
    );
    if (numbered.length >= 3 && numbered.length >= pages.length - 1) {
      for (const line of numbered) doomed.add(line.node!);
      continue;
    }

    const byText = new Map<string, OfficeContentNode[]>();
    for (const line of lines) {
      const key = line.node!.text!.trim().replace(/\s+/g, " ");
      byText.set(key, [...(byText.get(key) ?? []), line.node!]);
    }
    for (const repeats of byText.values()) {
      if (repeats.length >= 3) for (const node of repeats.slice(1)) doomed.add(node);
    }
  }

  if (doomed.size === 0) return;
  for (const page of pages) {
    page.children = (page.children ?? []).filter((child) => !doomed.has(child));
  }
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
      node.children = [{ type: "text", text: `[^${key}] ` }, ...(node.children ?? [])];
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
    includePageFurniture(ast.content, ast.auxiliary);
  }
  // Each visitor restores one thing the text renderer drops. They are composed
  // rather than merged because they are independent of one another and of the
  // node types they act on.
  const visitors = [
    markSectionStarts(anyPageHasText),
    markHeadingLevels(),
    numberFootnotes(),
    showLinkDestinations,
    expandMergedCells(),
  ];
  // `.to(…)` replaces the deprecated `.toText()`, and hands back the
  // per-document warnings that become our notes.
  const { value, messages } = asWorkbook
    ? await ast.to("csv")
    : await ast.to("text", {
        onNode: (node) => {
          for (const visit of visitors) visit(node);
        },
      });
  // Only the pdf and csv renderers can answer with bytes; both of ours are
  // string-shaped, so this narrows a union rather than handling a real case.
  const rendered = typeof value === "string" ? value : new TextDecoder().decode(value);
  const text = resolveImagePlaceholders(rendered, ast.attachments ?? []).trim();
  const notes = toNotes(messages);
  return notes.length > 0 ? { text, notes } : { text };
}
