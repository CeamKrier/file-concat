import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import wasmUrl from "@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url";

import { parsePdfPages } from "./liteparse-pages";

/**
 * liteparse (Apache-2.0, PDFium inside) in its own worker, for the reasons in
 * `worker-runner.ts`. Answers each page's markdown and whether the page holds a
 * picture, which core needs to tell a scanned page from a blank one. How it reads
 * lives in `liteparse-pages.ts`.
 */
const ready = init({ module_or_path: wasmUrl });

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await ready;
    self.postMessage({ result: await parsePdfPages(LiteParse, event.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
