// The pure half of the worker's queue: pacing, picking, chunking, checking.
// Kept apart so the decisions are tested without a browser.

import type { Clipping } from "./markdown";
import type { TrayItem } from "./messages";

/**
 * When the next request may go out, as one global chain: every caller takes
 * the slot after the last one handed out, so concurrent callers queue behind
 * each other instead of all waking together a delay from now.
 *
 * The gap counts from the later of now and the last slot, so a caller that
 * waited out a slow answer still leaves a full gap after it. Slow answers are
 * what comes before a 429, so that is when it matters.
 *
 * The gap is `base` plus up to `base` again at random. A fixed gap is the
 * machine pace a site looks for, and jitter is what every backoff guide adds
 * for the same reason.
 */
export function nextSlot(now: number, last: number, base: number, random: number): { wait: number; at: number } {
  const at = Math.max(now, last) + base + random * base;
  return { wait: at - now, at };
}

const waiting = (row: TrayItem) => row.state === "queued";

/**
 * The next row to clip: the oldest batch first, and inside a batch the page's
 * own order. A batch is every row stamped with the same `addedAt`, and the
 * tray is kept newest batch first with each batch in the order it arrived.
 */
export function pickNext(rows: TrayItem[]): TrayItem | undefined {
  const queued = rows.filter(waiting);
  if (queued.length === 0) return undefined;
  const oldest = Math.min(...queued.map((row) => row.addedAt));
  return queued.find((row) => row.addedAt === oldest);
}

/**
 * Splits a send into pushes the page will take: the web app refuses a push of
 * more than `maxFiles` files or `maxChars` characters. Order is kept, and a
 * single file past `maxChars` still goes alone, for the page to refuse by name.
 */
export function chunk<T extends { clipping: Clipping }>(rows: T[], maxFiles: number, maxChars: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const row of rows) {
    const size = row.clipping.markdown.length;
    if (current.length > 0 && (current.length >= maxFiles || chars + size > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(row);
    chars += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** A YouTube video or playlist id, or a site's own id: letters, digits, `_-`. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const validYouTubeId = (id: string) => ID.test(id);
