/**
 * The file tree's own press tally, flushed once per editing session.
 *
 * Module scope on purpose. The settings drawer unmounts its entire subtree when
 * it closes, so a ref held by a component would lose exactly the session it is
 * meant to measure. Everything resets when the Run changes, so one drop's
 * presses can never leak into the next.
 *
 * Nothing here leaves the browser but a control name and a count (ADR-0014): a
 * folder path is used as a comparison key and is never sent.
 */
import { currentRun, trackAmount } from "~/lib/metrics";

/** Which control a press landed on. Mirrors the `tree_press` value list. */
export type TreePress = "row-file" | "row-folder" | "box-file" | "box-folder" | "arrow";

/** A folder flipped back inside this window reads as an accident, not a decision. */
const UNDO_WINDOW_MS = 10_000;

let run: number | null = null;
const presses = new Map<TreePress, number>();
let lastSweep: { path: string; include: boolean; at: number } | null = null;
let revertedFiles = 0;

function reset(): void {
  presses.clear();
  lastSweep = null;
  revertedFiles = 0;
}

/** Drops whatever belonged to an earlier drop before anything new is recorded. */
function sync(): number | null {
  const open = currentRun();
  if (open !== run) {
    reset();
    run = open;
  }
  return open;
}

export function notePress(kind: TreePress): void {
  sync();
  presses.set(kind, (presses.get(kind) ?? 0) + 1);
}

/**
 * One folder sweep. `files` is how many the sweep addressed, which is the
 * magnitude a reversal is worth counting in.
 */
export function noteSweep(path: string, include: boolean, files: number): void {
  sync();
  const previous = lastSweep;
  lastSweep = { path, include, at: Date.now() };
  if (
    previous !== null &&
    previous.path === path &&
    previous.include !== include &&
    Date.now() - previous.at <= UNDO_WINDOW_MS
  ) {
    revertedFiles += files;
  }
}

/**
 * Writes the session's rows and starts a fresh one, the same way `tree_edit`
 * writes the increase since the last close rather than the whole count again.
 * A session nobody touched writes nothing.
 */
export function flushTreeInteractions(): void {
  if (sync() === null) return;
  for (const [kind, n] of presses) trackAmount("tree_press", { value: kind, n });
  if (revertedFiles > 0) trackAmount("tree_reverted", { n: revertedFiles });
  reset();
}
