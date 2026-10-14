import type { PdfPage } from "@fileconcat/core";
import type { LiteParse } from "@llamaindex/liteparse-wasm";

/**
 * How the product calls liteparse, kept out of the worker so the extraction
 * measurement (`packages/cli/scripts/measure-extraction-quality.ts`) reads PDFs
 * exactly the way the browser does.
 *
 * `imageMode: "off"` keeps `![](img_p1_1.jpg)` references to images nobody can
 * see out of the text. `includeComplexity` adds the picture signal at about 5 ms
 * a page (measured over 240 olmOCR-bench pages, 2026-10-05).
 */
const LITEPARSE_OPTIONS = {
  ocrEnabled: false,
  outputFormat: "markdown",
  imageMode: "off",
  includeComplexity: true,
  continueOnPageError: true,
  quiet: true,
} as const;

interface LiteparsePage {
  pageNum: number;
  markdown: string;
  complexity?: { reasons?: string[] };
}

/** Each page's markdown and whether it holds a picture, which core needs to tell a scanned page from a blank one. */
function toPdfPages(pages: readonly LiteparsePage[]): PdfPage[] {
  return pages.map((page) => {
    // liteparse's own `needsOcr` also fires on sparse text and on any
    // figure, so only the two reasons that mean "a picture" are read.
    const reasons = page.complexity?.reasons ?? [];
    return {
      number: page.pageNum,
      text: page.markdown,
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
  const read = async (keepHeadersFooters: boolean) => {
    const parser = new Parser({ ...LITEPARSE_OPTIONS, keepHeadersFooters });
    try {
      return await parser.parse(bytes);
    } finally {
      parser.free();
    }
  };
  let result = await read(true);
  if (result.pages.length < 2) result = await read(false);
  return { pages: toPdfPages(result.pages), skipped: result.pageErrors.length };
}
