/**
 * Clarity session tags — the lookup between a counter row and the recording
 * that explains it (ADR-0016).
 *
 * The counters (ADR-0013, ADR-0014) can say a Run produced a bundle nobody
 * exported. They are structurally incapable of saying why, and that is by
 * design. The recording that would say why already exists in Clarity; until now
 * there was no way to find it, because the only filters available were a date
 * range and a route. Answering one question meant scrubbing a window by hand.
 *
 * These tags carry the counters' own closed-shape vocabulary into Clarity so a
 * recording can be found by the thing a reading actually named. They add no new
 * information: the replay already shows file names, folder structure and the
 * on-screen bundle, which `/privacy` states outright. A tag only makes what is
 * already recorded searchable.
 *
 * **The hard line: no join key.** The `page` id and the Run number never leave
 * for Clarity. Sending either would tie an anonymous first-party counter row to
 * a third-party session profile and break the "unlinked" half of ADR-0013's
 * claim. Class-level filters answer every question we have (`outcome=abandoned`
 * beside `scale=large` finds the recording without a shared identifier). The Run
 * number appears below for local bookkeeping only, never as a value.
 *
 * **Tags are session-scoped and values accumulate.** Clarity keeps every value
 * ever set for a key in a session — `set(k,"a")` then `set(k,"b")` yields both,
 * which is documented behaviour and not a bug to work around — and one session
 * can hold several Runs. So `fc_outcome = abandoned` means "this session
 * contained an abandoned Run", never "this session was abandoned". Read it at
 * that granularity or not at all.
 *
 * **Never a count.** D1 owns the numbers. These tags are a handle: the abandoned
 * one rides a page-hide event that can be missed, so it under-counts by
 * construction. Counting sessions by tag would produce a second, quieter number
 * for a quantity the counters already answer exactly, which is the one failure
 * this whole split exists to avoid.
 */

import { currentRun, normalizeValue, surfaceLabel } from "./metrics";

declare global {
  interface Window {
    /** Installed by the inline bootstrap in `routes/__root.tsx`, which queues calls until the script lands. */
    clarity?: (...args: unknown[]) => void;
  }
}

/** Namespaced so ours never collide with a Clarity smart event or a future tag. */
const PREFIX = "fc_";

/**
 * Clarity ignores every tag past 128 on a page, silently. A session that keeps
 * dropping folders would spend that budget on repeats and lose the tags that
 * matter, so we stop well short of it and stop deliberately.
 */
const MAX_TAGS = 100;

/** Key=value pairs already sent this page load. Re-sending one stores the same value twice. */
const sent = new Set<string>();

const MB = 1024 * 1024;

function call(...args: unknown[]): void {
  if (typeof window === "undefined" || typeof window.clarity !== "function") return;
  try {
    window.clarity(...args);
  } catch {
    // Analytics must never break the tool.
  }
}

function tag(key: string, value: string): void {
  const clean = normalizeValue(value);
  if (clean === undefined) return;
  const id = `${key}=${clean}`;
  if (sent.has(id) || sent.size >= MAX_TAGS) return;
  sent.add(id);
  call("set", PREFIX + key, clean);
}

/** Not deduplicated: each occurrence is a funnel step, and the count is the point. */
function event(name: string): void {
  call("event", PREFIX + name);
}

/**
 * Band edges are the `files_over` thresholds the counters already publish, not
 * fresh numbers. A band nobody can map back to a counter is a band that starts
 * its own argument about what "large" means.
 */
function scaleOf(bytes: number): "small" | "medium" | "large" {
  if (bytes < MB) return "small";
  if (bytes < 32 * MB) return "medium";
  return "large";
}

// Which Runs reached a bundle, and which of those were taken. Kept in memory,
// never sent: this is how a page-hide decides whether anything was abandoned.
const bundledRuns = new Set<number>();
const exportedRuns = new Set<number>();
let hideHookAttached = false;

function attachHideHook(): void {
  if (hideHookAttached || typeof document === "undefined") return;
  hideHookAttached = true;
  // visibilitychange, not pagehide: Clarity uploads continuously, and the hidden
  // transition is the last moment a call reliably lands. The counters flush on
  // the same event.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    for (const run of bundledRuns) {
      if (exportedRuns.has(run)) continue;
      tag("outcome", "abandoned");
      return;
    }
  });
}

/** Which tool-hosting document the visit opened. Mirrors the `entry_surface` counter. */
export function tagSurface(pathname: string): void {
  tag("surface", surfaceLabel(pathname));
}

/** Where the files came from: a local drop, or the remote adapter that fetched them. */
export function tagSource(source: string): void {
  tag("source", source);
}

/**
 * One drop landed. `gaps` names the classes of content we could not read, from
 * the counters' vocabulary (`unreadable_ext`, `extract_failed`,
 * `archive_unsupported`) — the class only, never the extension, which is D1's
 * job and would burn the tag budget one file type at a time.
 */
export function tagDrop(bytes: number, gaps: readonly string[]): void {
  event("drop");
  tag("scale", scaleOf(bytes));
  for (const gap of gaps) tag("gap", gap);
}

/** A bundle exists and the reader can see it. From here on, leaving without an export is abandonment. */
export function tagBundleReady(): void {
  const run = currentRun();
  if (run !== null) bundledRuns.add(run);
  attachHideHook();
  event("bundle_ready");
}

/** The terminal action. Mirrors `output_taken`. */
export function tagOutcome(outcome: "copied" | "downloaded"): void {
  const run = currentRun();
  if (run !== null) exportedRuns.add(run);
  tag("outcome", outcome);
  event("export");
}
