import type { ExtractionResult } from "@fileconcat/core";

/**
 * The fallback reader for Office files (extraction router, step R1): anydoc,
 * MIT, 2.79 MiB gzipped, fetched only when a product reader came back with
 * nothing usable. Today that is mainly a 97-2003 `.ppt`, which nothing else in
 * the browser reads.
 */

// ponytail: one fixed limit. A wasm loop that never returns would otherwise
// stall the whole drop; per-size limits if a real deck needs longer.
const TIMEOUT_MS = 60_000;

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** One file at a time: the worker answers whichever message it got last. */
export function extractAnydoc(bytes: Uint8Array): Promise<ExtractionResult> {
  const run = queue.then(() => readOnce(bytes));
  queue = run.catch(() => undefined);
  return run;
}

function readOnce(bytes: Uint8Array): Promise<ExtractionResult> {
  worker ??= new Worker(new URL("./anydoc.worker.ts", import.meta.url), { type: "module" });
  const current = worker;
  return new Promise((resolve, reject) => {
    // Any failure may have trapped the instance, so the worker goes with it.
    const fail = (error: Error) => {
      clearTimeout(timer);
      current.terminate();
      if (worker === current) worker = null;
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("anydoc timed out")), TIMEOUT_MS);
    current.onmessage = ({ data }: MessageEvent<{ text?: string; error?: string }>) => {
      if (data.error !== undefined) return fail(new Error(data.error));
      clearTimeout(timer);
      resolve({ text: (data.text ?? "").trim() });
    };
    current.onerror = (event) => fail(new Error(event.message || "anydoc worker failed"));
    current.postMessage(bytes);
  });
}
