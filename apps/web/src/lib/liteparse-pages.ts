import type { PdfPage } from "@fileconcat/core";

/**
 * How the product calls liteparse, kept out of the worker so the extraction
 * measurement (`packages/cli/scripts/measure-extraction-quality.ts`) reads PDFs
 * exactly the way the browser does.
 *
 * `imageMode: "off"` keeps `![](img_p1_1.jpg)` references to images nobody can
 * see out of the text. `includeComplexity` adds the picture signal at about 5 ms
 * a page (measured over 240 olmOCR-bench pages, 2026-10-05).
 */
export const LITEPARSE_OPTIONS = {
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
export function toPdfPages(pages: readonly LiteparsePage[]): PdfPage[] {
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
