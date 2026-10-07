import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import wasmUrl from "@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url";

/**
 * liteparse (Apache-2.0, PDFium inside) in its own worker, for the reasons in
 * `worker-runner.ts`. Answers each page's markdown and whether the page holds a
 * picture, which core needs to tell a scanned page from a blank one.
 *
 * `imageMode: "off"` keeps `![](img_p1_1.jpg)` references to images nobody can
 * see out of the text. `includeComplexity` adds the picture signal at about 5 ms
 * a page (measured over 240 olmOCR-bench pages, 2026-10-05).
 */
const ready = init({ module_or_path: wasmUrl });

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await ready;
    const parser = new LiteParse({
      ocrEnabled: false,
      outputFormat: "markdown",
      imageMode: "off",
      includeComplexity: true,
      continueOnPageError: true,
      quiet: true,
    });
    try {
      const result = await parser.parse(event.data);
      const pages = result.pages.map((page) => {
        // liteparse's own `needsOcr` also fires on sparse text and on any
        // figure, so only the two reasons that mean "a picture" are read.
        const reasons = page.complexity?.reasons ?? [];
        return {
          number: page.pageNum,
          text: page.markdown,
          scanned: reasons.includes("scanned") || reasons.includes("embedded-images"),
        };
      });
      self.postMessage({ result: { pages, skipped: result.pageErrors.length } });
    } finally {
      parser.free();
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
