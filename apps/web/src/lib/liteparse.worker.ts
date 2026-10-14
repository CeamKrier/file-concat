import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import wasmUrl from "@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url";

import { LITEPARSE_OPTIONS, toPdfPages } from "./liteparse-pages";

/**
 * liteparse (Apache-2.0, PDFium inside) in its own worker, for the reasons in
 * `worker-runner.ts`. Answers each page's markdown and whether the page holds a
 * picture, which core needs to tell a scanned page from a blank one. The options
 * and the page mapping live in `liteparse-pages.ts`.
 */
const ready = init({ module_or_path: wasmUrl });

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await ready;
    const parser = new LiteParse(LITEPARSE_OPTIONS);
    try {
      const result = await parser.parse(event.data);
      self.postMessage({ result: { pages: toPdfPages(result.pages), skipped: result.pageErrors.length } });
    } finally {
      parser.free();
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
