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
 * (300 pages, 2026-10-15). `extractAnnotations` brings a link's address.
 */
const LITEPARSE_OPTIONS = {
  ocrEnabled: false,
  outputFormat: "markdown",
  imageMode: "off",
  includeComplexity: true,
  extractStructureTree: true,
  extractAnnotations: true,
  continueOnPageError: true,
  quiet: true,
} as const;

interface LiteparsePage {
  pageNum: number;
  markdown: string;
  complexity?: { reasons?: string[] };
  textItems?: TextItem[];
  structureTree?: { roots: StructureElement[] };
  annotations?: { subtype: string; uri?: string; rect?: Rect }[];
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

/** Each page's markdown and whether it holds a picture, which core needs to tell a scanned page from a blank one. */
function toPdfPages(pages: readonly LiteparsePage[]): PdfPage[] {
  return pages.map((page) => {
    // liteparse's own `needsOcr` also fires on sparse text and on any
    // figure, so only the two reasons that mean "a picture" are read.
    const reasons = page.complexity?.reasons ?? [];
    const figures = figureAlts(page);
    return {
      number: page.pageNum,
      text: withLinks(page),
      ...(figures.length ? { figures } : {}),
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
