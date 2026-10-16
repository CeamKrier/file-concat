import { linkWorthWriting, type PdfPage } from "@fileconcat/core";
import type { LiteParse } from "@llamaindex/liteparse-wasm";

/**
 * How the product calls liteparse, kept out of the worker so the extraction
 * measurement (`packages/cli/scripts/measure-extraction-quality.ts`) reads PDFs
 * exactly the way the browser does.
 *
 * `imageMode: "off"` keeps `![](img_p1_1.jpg)` references to images nobody can
 * see out of the text. `includeComplexity` adds the picture signal at about 5 ms
 * a page (measured over 240 olmOCR-bench pages, 2026-10-05).
 * `extractStructureTree` brings a tagged figure's alternative text: nothing on
 * an untagged PDF, about 1.7 ms a page on a tagged one of 42 elements a page
 * (300 pages, 2026-10-15). `extractAnnotations` brings a link's address and
 * a review comment's note. `skipDiagonalText` leaves out text set at an angle
 * before the layout is worked out: a diagonal watermark otherwise cost the page
 * a body line and read short columns as a table (Q37 O1). On pdf.js's test
 * files it changed 8 of 1834 pages, 8 words of diagonal text lost
 * (2026-10-15); a watermark's own text was never written.
 */
const LITEPARSE_OPTIONS = {
  ocrEnabled: false,
  outputFormat: "markdown",
  imageMode: "off",
  includeComplexity: true,
  extractStructureTree: true,
  extractAnnotations: true,
  skipDiagonalText: true,
  continueOnPageError: true,
  quiet: true,
} as const;

interface LiteparsePage {
  pageNum: number;
  pageLabel?: string;
  markdown: string;
  complexity?: { reasons?: string[] };
  textItems?: TextItem[];
  structureTree?: { roots: StructureElement[] };
  annotations?: Annotation[];
}

interface Annotation {
  subtype: string;
  uri?: string;
  rect?: Rect;
  quadpointRects?: Rect[];
  contents?: string;
  /** The author, the annotation's `/T`. */
  title?: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextItem extends Rect {
  rotation: number;
  text: string;
}

interface StructureElement {
  type: string;
  altText?: string;
  children: StructureElement[];
}

/** The `/Alt` of a tagged page's Figure elements (ISO 32000 14.9.3), which liteparse's markdown skips. */
function figureAlts(page: LiteparsePage): string[] {
  const alts: string[] = [];
  const visit = (element: StructureElement) => {
    if (element.type === "Figure" && element.altText) alts.push(element.altText);
    element.children.forEach(visit);
  };
  page.structureTree?.roots.forEach(visit);
  return alts;
}

/**
 * A page's markdown with each web link written as `[text](address)` (Q32 O1);
 * liteparse reads the link annotation and writes only the text under it. The
 * text is the words whose middle falls inside the link's rectangle, as
 * pymupdf4llm matches characters to a link, here with every character taken
 * as equally wide. Written in place when that text
 * occurs once on the page, and after the page otherwise; a link over no text
 * is skipped.
 *
 * ponytail: equal character widths; a proportional font can move a short
 * word at either end in or out. Per-character boxes would fix it
 * (`emitWordBoxes`).
 */
function withLinks(page: LiteparsePage): string {
  let markdown = page.markdown;
  const after: string[] = [];
  for (const link of page.annotations ?? []) {
    const address = (link.uri ?? "").replace(/\s+/g, "");
    if (link.subtype !== "link" || !link.rect || !address || address.startsWith("#")) continue;
    const text = linkText(link.rect, page.textItems ?? []);
    if (!linkWorthWriting(text, address)) continue;
    const at = markdown.indexOf(text);
    if (at >= 0 && at === markdown.lastIndexOf(text)) markdown = `${markdown.slice(0, at)}[${text}](${address})${markdown.slice(at + text.length)}`;
    else after.push(`[${text}](${address})`);
  }
  return [markdown, ...after].join("\n\n");
}

/**
 * A word a line's end split with a hyphen, joined where liteparse left it
 * apart. liteparse joins one inside a paragraph (`splice_soft_hyphens`: a
 * letter before the hyphen, a lowercase letter after, the hyphen dropped) but
 * not inside a table cell, and it joins a capitalized continuation with a
 * space. The line ends are the text items' ends. A lowercase continuation
 * drops the hyphen, as liteparse, marker, docling, GROBID and pdf.js's find
 * do, unless the document writes the word with its hyphen on one line
 * elsewhere: a survey's table cut "Post-medieval" 368 times, and the rule
 * alone wrote "Postmedieval". Any other keeps the hyphen and loses the space,
 * as pdf.js's find does.
 *
 * ponytail: matched by the split word's text, so the same word written
 * mid-line with a hyphen and a space ("low- and") on that page is joined too.
 * The items' order would tell the two apart.
 */
function withLineEndHyphens(markdown: string, items: readonly TextItem[], compounds: ReadonlySet<string>): string {
  const stems = new Set(items.map((item) => /(?:^|\s)(\S*\p{L})-\s*$/u.exec(item.text)?.[1]).filter(Boolean));
  if (stems.size === 0) return markdown;
  return markdown.replace(/(?<!\S)(\S*\p{L})- (\p{L}[\p{L}\p{M}]*)/gu, (whole, stem: string, next: string) => {
    if (!stems.has(stem)) return whole;
    return /^\p{Ll}/u.test(next) && !compounds.has(`${stem}-${next}`) ? stem + next : `${stem}-${next}`;
  });
}

/** Every word a document writes with a hyphen inside one line, as `stem-next`. */
function hyphenated(pages: readonly LiteparsePage[]): Set<string> {
  const words = new Set<string>();
  for (const page of pages) for (const [, stem, next] of page.markdown.matchAll(/(?<!\S)(\S*\p{L})-(\p{L}[\p{L}\p{M}]*)/gu)) words.add(`${stem}-${next}`);
  return words;
}

/** The words of the upright lines under `rect`, each placed by its middle's share of its line's width. */
function linkText(rect: Rect, items: readonly TextItem[]): string {
  const middle = rect.y + rect.height / 2;
  return items
    .filter((item) => Math.abs(item.rotation) < 2 && item.y <= middle && middle <= item.y + item.height)
    .map((item) =>
      [...item.text.matchAll(/\S+/g)]
        .filter((word) => {
          const x = item.x + (item.width * (word.index! + word[0].length / 2)) / item.text.length;
          return rect.x <= x && x <= rect.x + rect.width;
        })
        .map((word) => word[0])
        .join(" "),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The pages whose text mostly lies at a quarter turn, with the turn that sets
 * them upright.
 *
 * liteparse reads a sideways page's text, then its markdown writer drops every
 * line more than 5 degrees off horizontal (it means to drop margin banners and
 * watermarks), so a page with `/Rotate 90`, or a landscape table drawn turned,
 * comes out empty with no note. Poppler's `pdftotext` lays each page out along
 * the quarter turn carrying the most characters (`primaryRot`); this is that
 * vote, and liteparse's own `pageOrientationCorrections` turns the page back.
 *
 * Diagonal text votes for nothing, so a watermark cannot turn a page, and a page
 * turns only when its sideways text outweighs its upright text: turning an
 * upright page empties it.
 */
function sidewaysPages(pages: readonly LiteparsePage[]): { page: number; angle: number }[] {
  return pages.flatMap((page) => {
    const votes = new Map<number, number>();
    for (const item of page.textItems ?? []) {
      const turn = Math.round(item.rotation / 90) * 90;
      if (Math.abs(item.rotation - turn) > 2) continue;
      const angle = ((turn % 360) + 360) % 360;
      votes.set(angle, (votes.get(angle) ?? 0) + item.text.replace(/\s/g, "").length);
    }
    const upright = votes.get(0) ?? 0;
    const [angle, count] = [...votes].filter(([turn]) => turn !== 0).sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    return count > upright ? [{ page: page.pageNum, angle }] : [];
  });
}

/**
 * ISO 32000 12.5.6.2's markup annotations, the ones a viewer lists as review
 * comments, less sound and redaction (Tika writes every markup annotation's
 * note after its page). A popup's own note is never shown (12.5.6.14).
 */
const COMMENTS = new Set(["text", "freetext", "line", "square", "circle", "polygon", "polyline", "highlight", "underline", "squiggly", "strikeout", "stamp", "caret", "ink", "fileattachment"]);
const TEXT_MARKUP = new Set(["highlight", "underline", "squiggly", "strikeout"]);

/**
 * A page's review comments, each with the words a highlight covers.
 *
 * ponytail: liteparse gives no annotation flags, so a comment its author set
 * Hidden (12.5.3) is read too, as Tika reads it; pdf.js's `getAnnotations`
 * has the flags, at a second read of the file.
 */
function pageComments(page: LiteparsePage): NonNullable<PdfPage["comments"]> {
  return (page.annotations ?? []).flatMap((note) => {
    if (!COMMENTS.has(note.subtype) || !note.contents?.trim()) return [];
    const boxes = note.quadpointRects?.length ? note.quadpointRects : note.rect ? [note.rect] : [];
    const anchor = TEXT_MARKUP.has(note.subtype) ? boxes.map((box) => linkText(box, page.textItems ?? [])).join(" ") : "";
    return [{ text: note.contents, ...(note.title ? { author: note.title } : {}), ...(anchor.trim() ? { anchor } : {}) }];
  });
}

/**
 * The lines an upright page sets vertically, a margin banner or a turned table
 * heading, which liteparse's markdown writer drops with the watermarks (Q38 O1).
 * Poppler's `pdftotext` writes text at every quarter turn; here the page's
 * upright text comes first and its vertical lines after it. A line already in
 * the page's text, or written on an earlier page, is left out, so a banner
 * repeated on every page is written once. A line with no letter or digit is
 * left out too.
 *
 * A journal's "Downloaded from ... by guest" stamp is vertical too, and is
 * written: on olmOCR-bench's single-page header tests this costs 57.0% to
 * 55.5% (2026-10-15). Leaving out the margin would also leave out a table set
 * vertically on an upright page, which the same bench holds.
 */
function verticalLines(page: LiteparsePage, written: Set<string>): string[] {
  const lines = new Map<string, string[]>();
  for (const item of page.textItems ?? []) {
    const turn = Math.round(item.rotation / 90) * 90;
    if (Math.abs(turn % 180) !== 90 || Math.abs(item.rotation - turn) > 2 || !item.text.trim()) continue;
    const key = `${turn % 360}:${Math.round(item.x)}`;
    lines.set(key, [...(lines.get(key) ?? []), item.text.trim()]);
  }
  return Array.from(lines.values(), (parts) => parts.join(" ")).filter((line) => {
    if (!/[\p{L}\p{N}]/u.test(line) || written.has(line) || page.markdown.includes(line)) return false;
    written.add(line);
    return true;
  });
}

/** Each page's markdown and whether it holds a picture, which core needs to tell a scanned page from a blank one. */
function toPdfPages(pages: readonly LiteparsePage[]): PdfPage[] {
  const written = new Set<string>();
  const compounds = hyphenated(pages);
  return pages.map((page) => {
    // liteparse's own `needsOcr` also fires on sparse text and on any
    // figure, so only the two reasons that mean "a picture" are read.
    const reasons = page.complexity?.reasons ?? [];
    const figures = figureAlts(page);
    const comments = pageComments(page);
    return {
      number: page.pageNum,
      ...(page.pageLabel ? { label: page.pageLabel } : {}),
      text: [withLinks({ ...page, markdown: withLineEndHyphens(page.markdown, page.textItems ?? [], compounds) }), ...verticalLines(page, written)].filter(Boolean).join("\n\n"),
      ...(figures.length ? { figures } : {}),
      ...(comments.length ? { comments } : {}),
      scanned: reasons.includes("scanned") || reasons.includes("embedded-images"),
    };
  });
}

/**
 * Read a PDF the way the browser does. Running headers and footers are kept,
 * because liteparse strips every copy of a line repeated across pages, title or
 * confidentiality marking included, and core's `assemblePdfPages` keeps the
 * first copy instead. No surveyed reader keeps one copy (docling, marker and
 * liteparse drop all, unstructured and pymupdf4llm keep all); liteparse's own
 * config comment suggests this split.
 *
 * A single page is read again with stripping on. With nothing to repeat across,
 * liteparse removes only fixed chrome there (a page number, URL, DOI, copyright
 * line), which no title lives in; keeping it cost olmOCR-bench's header and
 * footer tests 57.4 to 40.5 (2026-10-14). Re-reading one page costs little.
 */
export async function parsePdfPages(
  Parser: typeof LiteParse,
  bytes: Uint8Array,
): Promise<{ pages: PdfPage[]; skipped: number }> {
  const read = async (keepHeadersFooters: boolean, pageOrientationCorrections?: { page: number; angle: number }[]) => {
    const parser = new Parser({ ...LITEPARSE_OPTIONS, keepHeadersFooters, pageOrientationCorrections });
    try {
      return await parser.parse(bytes);
    } finally {
      parser.free();
    }
  };
  let result = await read(true);
  const keep = result.pages.length >= 2;
  const corrections = sidewaysPages(result.pages);
  // One more read covers both: pages left uncorrected come back as they were.
  if (!keep || corrections.length > 0) result = await read(keep, corrections.length > 0 ? corrections : undefined);
  return { pages: toPdfPages(result.pages), skipped: result.pageErrors.length };
}
