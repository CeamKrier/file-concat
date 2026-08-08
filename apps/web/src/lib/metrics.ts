/**
 * Product counters (ADR-0013, revised by ADR-0014).
 *
 * What leaves the browser is a file extension, a source type, a marker filename
 * from the published list, or an exact integer — never a file name, a path, or
 * any content. Events carry a random `page` id created once per page load, kept
 * in memory only, and never reused: a single visit reads as a sequence, and
 * nothing links one visit to another or to a person.
 *
 * Quantities are **exact**. Buckets were tried first and made every derived rate
 * unusable (a 40x median spread on characters-per-file), and the rounding is not
 * what protects anyone: an exact number can be bucketed inside a query, while a
 * stored bucket can never be recovered. What carries the privacy claim is the
 * closed *shape* of a value, which is unchanged.
 *
 * Events are queued and flushed in one batch so a 5000-file drop costs a single
 * request rather than one per file.
 */

import type { MetricEvent } from "./metric-events";

export type { MetricEvent };

const ENDPOINT = "/api/e";
/** Matches the server's cap. A batch larger than this is truncated, not split. */
const MAX_EVENTS_PER_FLUSH = 50;
/** Collect briefly so one drop produces one request. */
const FLUSH_DELAY_MS = 1500;
/**
 * Rows per tally before the tail is folded. Keeps the row count of a run bounded
 * by variety rather than by file count: a 2000-file monorepo and a 5-file folder
 * cost the same order of rows.
 */
const TALLY_LIMIT = 25;
/** Where a folded tail lands. Never silently dropped — a missing tail reads as full coverage. */
const FOLDED_KEY = "other";
/** Rejects a nonsense quantity before it reaches the wire. ~1 TB, or 31 years in ms. */
const MAX_AMOUNT = 1e12;

/**
 * Wire keys are short because this rides in a beacon body. Note `n` is the event
 * *name* here while the `n` column in D1 is the count — the server maps `q` to
 * that column.
 */
type QueuedEvent = { n: MetricEvent; v?: string; q?: number; b?: number; r?: number };

/** One extension (or format, or marker) and what it accounted for in this run. */
export type Tally = Map<string, { n: number; b?: number }>;

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Random, in-memory only, one per page load. Not a cookie, not in storage, not
 * derived from anything about the visitor.
 */
let pageId: string | null = null;

/**
 * Which Run the events being recorded belong to. A plain counter rather than
 * another random id: it groups a drop's events without adding entropy, and it
 * cannot link anything across page loads because it restarts at 1 with `pageId`.
 */
let runSeq = 0;

/**
 * `entry_surface` describes the page load, not the component. `AppFlow` remounts
 * on client navigation while `pageId` lives on, so without this guard one visit
 * records the same surface twice.
 */
let entrySurfaceRecorded = false;

function getPageId(): string {
  if (!pageId) {
    pageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return pageId;
}

/** Opens a new Run. Called once per ingest, before anything about it is recorded. */
export function startRun(): number {
  runSeq += 1;
  return runSeq;
}

/** The Run currently being measured, or null before the first drop. */
export function currentRun(): number | null {
  return runSeq === 0 ? null : runSeq;
}

/**
 * Values are a closed shape by construction: lowercase, short, and limited to
 * the characters an extension / source type / marker name needs. A value that
 * cannot survive this is dropped rather than sent in a mangled form.
 *
 * Exported so the Clarity session tags (`./clarity-tags`) pass through the same
 * filter: a value our own counters would refuse is not handed to a third party
 * either.
 */
export function normalizeValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._/+-]/g, "");
  return cleaned.length > 0 && cleaned.length <= 32 ? cleaned : undefined;
}

/** Whole, non-negative, and inside a range any real drop stays within. */
function normalizeAmount(amount: number | undefined): number | undefined {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  const rounded = Math.round(amount);
  return rounded >= 0 && rounded <= MAX_AMOUNT ? rounded : undefined;
}

function enqueue(event: QueuedEvent): void {
  queue.push(event);
  attachUnloadHook();

  if (queue.length >= MAX_EVENTS_PER_FLUSH) {
    flush();
    return;
  }
  if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

function flush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  // splice removes exactly what we send; anything over the cap stays queued for
  // the next flush rather than being dropped on the floor.
  const batch = queue.splice(0, MAX_EVENTS_PER_FLUSH);
  if (queue.length > 0 && flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);

  const body = JSON.stringify({ s: getPageId(), e: batch });

  // sendBeacon survives the page going away, which is exactly when the last
  // events (output_taken) tend to fire. Counters are best-effort: a failure is
  // never surfaced and never retried.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Counters must never break the tool.
  }
}

let unloadHookAttached = false;

function attachUnloadHook(): void {
  if (unloadHookAttached || typeof document === "undefined") return;
  unloadHookAttached = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Record one label-only event. Safe to call anywhere: a no-op during SSR. */
export function track(name: MetricEvent, value?: string): void {
  if (import.meta.env.SSR) return;

  const v = normalizeValue(value);
  const r = currentRun();
  enqueue({ n: name, ...(v === undefined ? {} : { v }), ...(r === null ? {} : { r }) });
}

/**
 * Record a measured quantity: `n` a count, `b` a size in bytes. Either may be
 * omitted; an event carrying neither a value nor a quantity is dropped, since it
 * would say nothing beyond "this happened" that the name does not already say.
 */
export function trackAmount(
  name: MetricEvent,
  amounts: { value?: string; n?: number; b?: number },
): void {
  if (import.meta.env.SSR) return;

  const v = normalizeValue(amounts.value);
  const q = normalizeAmount(amounts.n);
  const b = normalizeAmount(amounts.b);
  if (v === undefined && q === undefined && b === undefined) return;

  const r = currentRun();
  enqueue({
    n: name,
    ...(v === undefined ? {} : { v }),
    ...(q === undefined ? {} : { q }),
    ...(b === undefined ? {} : { b }),
    ...(r === null ? {} : { r }),
  });
}

/**
 * Record a whole tally as one row per key, largest first. Past {@link TALLY_LIMIT}
 * keys the tail is summed into a single `other` row: the totals stay correct and
 * the row count of a run stays bounded, which is the whole reason rows are scoped
 * to an extension rather than to a file.
 */
export function trackTally(name: MetricEvent, tally: Tally, limit = TALLY_LIMIT): void {
  if (import.meta.env.SSR || tally.size === 0) return;

  const ranked = [...tally.entries()].sort((a, b) => b[1].n - a[1].n);
  const head = ranked.slice(0, limit);
  const tail = ranked.slice(limit);

  for (const [value, amounts] of head) {
    trackAmount(name, { value, n: amounts.n, b: amounts.b });
  }
  if (tail.length > 0) {
    const folded = tail.reduce(
      (acc, [, amounts]) => ({ n: acc.n + amounts.n, b: acc.b + (amounts.b ?? 0) }),
      { n: 0, b: 0 },
    );
    trackAmount(name, { value: FOLDED_KEY, n: folded.n, b: folded.b || undefined });
  }
}

/** Add one file to a tally. The single place a per-extension row is accumulated. */
export function addToTally(tally: Tally, key: string, bytes?: number): void {
  const existing = tally.get(key);
  if (existing) {
    existing.n += 1;
    if (bytes !== undefined) existing.b = (existing.b ?? 0) + bytes;
    return;
  }
  tally.set(key, { n: 1, ...(bytes === undefined ? {} : { b: bytes }) });
}

/**
 * Which document hosted the drop. The tool renders on the home route, every
 * `/for/*` persona page, the how-to page and inside blog posts, so this says
 * which tool-hosting surface a visit opened the tool on. It is deliberately not
 * a page-view counter: routes that do not host the tool (`/docs`, `/blog`,
 * `/privacy`) record nothing, and Search Console covers those (ADR-0014).
 */
export function trackEntrySurface(pathname: string): void {
  if (entrySurfaceRecorded) return;
  entrySurfaceRecorded = true;
  track("entry_surface", surfaceLabel(pathname));
}

/**
 * The label a tool-hosting route is recorded under. Exported because the Clarity
 * session tags record the same surface, and two instruments naming one page
 * differently is a disagreement nobody can settle after the fact.
 */
export function surfaceLabel(pathname: string): string {
  return pathname === "/" ? "home" : pathname.replace(/^\/+|\/+$/g, "").slice(0, 32);
}
