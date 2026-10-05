import init, { toMarkdownBytes } from "@firecrawl/anydoc-wasm";
import wasmUrl from "@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url";

/**
 * anydoc in its own worker, because a wasm trap leaves its instance answering
 * "unreachable" to every later call (measured in the extraction eval,
 * 2026-10-05) and the bindings cannot be instantiated twice in one realm. The
 * client terminates this worker after any failure and starts a fresh one.
 */
const ready = init({ module_or_path: wasmUrl });

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await ready;
    self.postMessage({ text: toMarkdownBytes(event.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
