import type { ExtractionResult } from "@fileconcat/core";

import { workerRunner } from "./worker-runner";

/**
 * The fallback reader for Office files (extraction router, step R1): anydoc,
 * MIT, 2.79 MiB gzipped, fetched only when a product reader came back with
 * nothing usable. Today that is mainly a 97-2003 `.ppt`, which nothing else in
 * the browser reads.
 */

// ponytail: one fixed limit; per-size limits if a real deck needs longer.
const read = workerRunner<Uint8Array, string>(
  () => new Worker(new URL("./anydoc.worker.ts", import.meta.url), { type: "module" }),
  60_000,
);

export async function extractAnydoc(bytes: Uint8Array): Promise<ExtractionResult> {
  return { text: (await read(bytes)).trim() };
}
