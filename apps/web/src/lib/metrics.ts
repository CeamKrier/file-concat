/**
 * Product counters (ADR-0013).
 *
 * What leaves the browser is a file extension, a source type, or a bucket
 * label — never a file name, a path, or any content. Events carry a random
 * `page` id that is created once per page load, kept in memory only, and never
 * reused: a single visit reads as a sequence, and nothing links one visit to
 * another or to a person.
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

type QueuedEvent = { n: MetricEvent; v?: string };

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Random, in-memory only, one per page load. Not a cookie, not in storage, not
 * derived from anything about the visitor.
 */
let pageId: string | null = null;

function getPageId(): string {
  if (!pageId) {
    pageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return pageId;
}

/**
 * Values are a closed shape by construction: lowercase, short, and limited to
 * the characters an extension / source type / bucket label needs. A value that
 * cannot survive this is dropped rather than sent in a mangled form.
 */
function normalizeValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._/+-]/g, "");
  return cleaned.length > 0 && cleaned.length <= 32 ? cleaned : undefined;
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
  // events (output_taken, bundle_size) tend to fire. Counters are best-effort:
  // a failure is never surfaced and never retried.
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

/** Record one event. Safe to call anywhere: a no-op during SSR. */
export function track(name: MetricEvent, value?: string): void {
  if (import.meta.env.SSR) return;

  const v = normalizeValue(value);
  queue.push(v === undefined ? { n: name } : { n: name, v });
  attachUnloadHook();

  if (queue.length >= MAX_EVENTS_PER_FLUSH) {
    flush();
    return;
  }
  if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

/**
 * Record each distinct value once, however many files carried it. "How many
 * visits hit a .dwg" is the roadmap question; "how many .dwg files exist in one
 * folder" is noise, and one folder of images would otherwise drown the signal.
 */
export function trackDistinct(name: MetricEvent, values: Iterable<string>): void {
  const seen = new Set<string>();
  for (const value of values) {
    const v = normalizeValue(value);
    if (v === undefined || seen.has(v)) continue;
    seen.add(v);
    track(name, v);
  }
}

/** Label `n` by the first edge it falls under, e.g. 7 over [1, 5, 20] -> "6-20". */
function bucketLabel(n: number, edges: readonly number[]): string {
  let lower = 0;
  for (const edge of edges) {
    if (n <= edge) return lower + 1 === edge ? String(edge) : `${lower + 1}-${edge}`;
    lower = edge;
  }
  return `${lower}+`;
}

export function trackBatchSize(fileCount: number): void {
  track("batch_size", bucketLabel(fileCount, [1, 5, 20, 100, 500, 2000]));
}

export function trackBundleSize(chars: number): void {
  track("bundle_size", bucketLabel(chars, [10_000, 100_000, 1_000_000, 10_000_000]));
}

/**
 * Which document hosted the drop. The tool renders on the home route, every
 * `/for/*` persona page, the how-to page and inside blog posts, so this is the
 * only way to tell a converting surface from an SEO landing page.
 */
export function trackEntrySurface(pathname: string): void {
  const route = pathname === "/" ? "home" : pathname.replace(/^\/+|\/+$/g, "").slice(0, 32);
  track("entry_surface", route);
}
