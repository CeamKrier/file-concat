import {
  rtfTitle,
  withoutHiddenText,
  withRtfChoices,
  withRtfComments,
  withRtfFurniture,
  type ExtractionNote,
  type ExtractionResult,
} from "@fileconcat/core";

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
  // officeparser reads an RTF comment itself; anydoc skips it, so it is
  // written into the text first, where hidden text inside it goes too. The
  // same for its page headers and footers (C7). Before either, the choices
  // RTF leaves to a reader are made (N19).
  const { bytes: commented, comments } = withRtfComments(withRtfChoices(bytes));
  const { bytes: readable, hidden } = withoutHiddenText(withRtfFurniture(commented));
  const text = (await read(readable)).trim();
  if (!text) return { text };
  const notes: ExtractionNote[] = [];
  if (hidden > 0) notes.push({ kind: "hidden-left-out", count: hidden });
  if (comments > 0) notes.push({ kind: "comments-included", count: comments });
  // anydoc skips RTF's info group, where the title is (Q30 O2).
  const title = rtfTitle(bytes);
  return { text, ...(notes.length ? { notes } : {}), ...(title ? { title } : {}) };
}
