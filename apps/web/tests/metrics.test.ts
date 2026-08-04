import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Counters are best-effort and fire-and-forget, so the contract worth pinning is
 * what actually leaves the browser: the event names, the closed shape of a value,
 * the exactness of a quantity (ADR-0014 replaced buckets precisely because they
 * could not be un-rounded), and the promise that a drop costs one row per
 * extension rather than one per file.
 */

/** Wire shape: `n` name, `v` value, `q` quantity, `b` bytes, `r` run. */
type SentEvent = { n: string; v?: string; q?: number; b?: number; r?: number };
type SentBatch = { s: string; e: SentEvent[] };

let sent: SentBatch[];
let metrics: typeof import("~/lib/metrics");

beforeEach(async () => {
  sent = [];
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    ...navigator,
    sendBeacon: (_url: string, body: Blob) => {
      void body.text().then((text) => sent.push(JSON.parse(text) as SentBatch));
      return true;
    },
  });
  // The page id, the run counter and the entry-surface guard are module state
  // that lives exactly as long as one page load. Re-importing per test is what
  // gives each test a fresh page rather than leaking one test's runs into the next.
  vi.resetModules();
  metrics = await import("~/lib/metrics");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Advance past the queue's debounce and let the blob read settle. */
async function flush(): Promise<SentEvent[]> {
  await vi.advanceTimersByTimeAsync(2000);
  await vi.runAllTimersAsync();
  return sent.flatMap((batch) => batch.e);
}

describe("track", () => {
  it("batches events from one drop into a single request", async () => {
    metrics.track("unreadable_ext", "dwg");
    metrics.track("unreadable_ext", "psd");
    metrics.track("output_taken", "copy");
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].e).toHaveLength(3);
  });

  it("tags every event in a batch with the same page id", async () => {
    metrics.track("output_taken", "copy");
    await flush();
    expect(sent[0].s).toMatch(/^[a-z0-9-]{8,64}$/i);
  });

  it("drops a value the server would reject rather than sending it mangled", async () => {
    metrics.track("unreadable_ext", "x".repeat(64));
    metrics.track("unreadable_ext", "d w g");
    const events = await flush();

    expect(events.find((e) => e.v?.length === 64)).toBeUndefined();
    expect(events.some((e) => e.v === "dwg")).toBe(true);
  });
});

describe("run scoping", () => {
  it("leaves an event recorded before the first drop unscoped", async () => {
    metrics.trackEntrySurface("/");
    const events = await flush();
    expect(events[0].r).toBeUndefined();
  });

  it("scopes everything after a drop to that drop", async () => {
    metrics.startRun();
    metrics.track("output_taken", "download");
    const events = await flush();
    expect(events[0].r).toBe(1);
  });

  it("separates a second drop in the same visit from the first", async () => {
    metrics.startRun();
    metrics.track("output_taken", "copy");
    metrics.startRun();
    metrics.track("output_taken", "download");
    const events = await flush();

    expect(events.map((e) => [e.v, e.r])).toEqual([
      ["copy", 1],
      ["download", 2],
    ]);
  });

  it("reports no run before the first drop, then the current one", () => {
    expect(metrics.currentRun()).toBeNull();
    expect(metrics.startRun()).toBe(1);
    expect(metrics.currentRun()).toBe(1);
  });
});

describe("trackAmount", () => {
  it("sends the exact number, never a bucket", async () => {
    metrics.trackAmount("batch_size", { n: 1847, b: 41_200_331 });
    const events = await flush();

    expect(events[0].q).toBe(1847);
    expect(events[0].b).toBe(41_200_331);
    expect(events[0].v).toBeUndefined();
  });

  it("rounds a fractional duration to whole milliseconds", async () => {
    metrics.trackAmount("ingest_ms", { n: 8342.71 });
    const events = await flush();
    expect(events[0].q).toBe(8343);
  });

  it("keeps a zero, which is a real reading", async () => {
    metrics.trackAmount("bundle_size", { n: 0, b: 0 });
    const events = await flush();
    expect(events[0].q).toBe(0);
    expect(events[0].b).toBe(0);
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [1e15]])(
    "drops the nonsense quantity %p instead of sending it",
    async (amount) => {
      metrics.trackAmount("batch_size", { n: amount });
      await flush();
      expect(sent).toHaveLength(0);
    },
  );

  it("drops an event carrying neither a label nor a quantity", async () => {
    metrics.trackAmount("files_over", {});
    await flush();
    expect(sent).toHaveLength(0);
  });
});

describe("trackTally", () => {
  it("reports one row per extension carrying its count and byte total", async () => {
    const tally: import("~/lib/metrics").Tally = new Map();
    metrics.addToTally(tally, "png", 100);
    metrics.addToTally(tally, "png", 250);
    metrics.addToTally(tally, "dwg", 900);
    metrics.trackTally("unreadable_ext", tally);
    const events = await flush();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ v: "png", q: 2, b: 350 });
    expect(events[1]).toMatchObject({ v: "dwg", q: 1, b: 900 });
  });

  it("folds the tail past the cap into one row without losing the totals", async () => {
    const tally: import("~/lib/metrics").Tally = new Map([
      ["ts", { n: 5, b: 50 }],
      ["js", { n: 3, b: 30 }],
      ["md", { n: 2, b: 20 }],
      ["css", { n: 1, b: 10 }],
    ]);
    metrics.trackTally("file_ext", tally, 2);
    const events = await flush();

    expect(events.map((e) => e.v)).toEqual(["ts", "js", "other"]);
    expect(events[2]).toMatchObject({ v: "other", q: 3, b: 30 });
    // The fold is a fold, not a truncation: the totals still add up.
    expect(events.reduce((sum, e) => sum + (e.q ?? 0), 0)).toBe(11);
    expect(events.reduce((sum, e) => sum + (e.b ?? 0), 0)).toBe(110);
  });

  it("sends nothing when a drop had no files of this kind", async () => {
    metrics.trackTally("unreadable_ext", new Map());
    await flush();
    expect(sent).toHaveLength(0);
  });
});

describe("trackEntrySurface", () => {
  it.each([
    ["/", "home"],
    ["/for/legal", "for/legal"],
    ["/how-to/share-all-files-with-ai", "how-to/share-all-files-with-ai"],
  ])("records %s as %s", async (pathname, expected) => {
    metrics.trackEntrySurface(pathname);
    const events = await flush();
    expect(events[0].v).toBe(expected);
  });

  it("records once per page load, however many times the tool mounts", async () => {
    // AppFlow remounts on client navigation while the page id lives on. Without
    // the guard one visit counts its surface twice and every conversion rate
    // computed against it is wrong.
    metrics.trackEntrySurface("/");
    metrics.trackEntrySurface("/");
    metrics.trackEntrySurface("/for/legal");
    const events = await flush();

    expect(events).toHaveLength(1);
    expect(events[0].v).toBe("home");
  });
});
