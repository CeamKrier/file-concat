import { withoutHiddenText, type ExtractionResult } from "@fileconcat/core";

import { workerRunner } from "./worker-runner";

/**
 * The fallback reader for Office files (extraction router, step R1): anydoc,
 * MIT, 2.79 MiB gzipped, fetched only when a product reader came back with
 * nothing usable, such as a 97-2003 `.ppt` core's own deck reader declined
 * (PowerPoint 95, a broken edit chain).
 */

// ponytail: one fixed limit; per-size limits if a real deck needs longer.
const read = workerRunner<Uint8Array, string>(
  () => new Worker(new URL("./anydoc.worker.ts", import.meta.url), { type: "module" }),
  60_000,
);

export async function extractAnydoc(bytes: Uint8Array): Promise<ExtractionResult> {
  // The same hidden text officeparser's path leaves out (Q18 O1).
  const { bytes: readable, hidden } = withoutHiddenText(bytes);
  const text = (await read(readable)).trim();
  return hidden > 0 && text ? { text, notes: [{ kind: "hidden-left-out", count: hidden }] } : { text };
}
