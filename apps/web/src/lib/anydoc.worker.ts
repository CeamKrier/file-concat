import init, { toMarkdownBytes } from "@firecrawl/anydoc-wasm";
import wasmUrl from "@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url";

/**
 * anydoc in its own worker (see `worker-runner.ts`): its bindings cannot be
 * instantiated twice in one realm, so a trapped instance is only replaced by
 * replacing the worker.
 */
const ready = init({ module_or_path: wasmUrl });

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await ready;
    self.postMessage({ result: toMarkdownBytes(event.data) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
