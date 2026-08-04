import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track, trackBatchSize, trackBundleSize, trackDistinct, trackEntrySurface } from "~/lib/metrics";

/**
 * Counters are best-effort and fire-and-forget, so the contract worth pinning is
 * what actually leaves the browser: the event names, the shape of the values,
 * and the promise in ADR-0013 that a batch carries one data point per distinct
 * value rather than one per file.
 */

type SentEvent = { n: string; v?: string };

let sent: { s: string; e: SentEvent[] }[];

async function readBlob(blob: Blob): Promise<{ s: string; e: SentEvent[] }> {
  return JSON.parse(await blob.text());
}

beforeEach(() => {
  sent = [];
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    ...navigator,
    sendBeacon: (_url: string, body: Blob) => {
      void readBlob(body).then((parsed) => sent.push(parsed));
      return true;
    },
  });
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
    track("unreadable_ext", "dwg");
    track("unreadable_ext", "psd");
    track("batch_size", "6-20");
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].e).toHaveLength(3);
  });

  it("tags every event in a batch with the same page id", async () => {
    track("output_taken", "copy");
    await flush();
    expect(sent[0].s).toMatch(/^[a-z0-9-]{8,64}$/i);
  });

  it("drops a value the server would reject rather than sending it mangled", async () => {
    // A path separator survives (source types use none, but buckets may);
    // spaces and quotes do not, and an over-long value is dropped entirely.
    track("unreadable_ext", "x".repeat(64));
    track("unreadable_ext", "d w g");
    const events = await flush();

    expect(events.find((e) => e.v?.length === 64)).toBeUndefined();
    expect(events.some((e) => e.v === "dwg")).toBe(true);
  });
});

describe("trackDistinct", () => {
  it("reports one data point per extension, however many files carried it", async () => {
    trackDistinct("unreadable_ext", ["png", "png", "png", "dwg", "PNG"]);
    const events = await flush();

    expect(events.map((e) => e.v).sort()).toEqual(["dwg", "png"]);
  });

  it("sends nothing when a batch had no unreadable files", async () => {
    trackDistinct("unreadable_ext", []);
    await flush();
    expect(sent).toHaveLength(0);
  });
});

describe("buckets", () => {
  it.each([
    [1, "1"],
    [3, "2-5"],
    [20, "6-20"],
    [21, "21-100"],
    [1500, "501-2000"],
    [9000, "2000+"],
  ])("labels a batch of %i as %s", async (count, label) => {
    trackBatchSize(count);
    const events = await flush();
    expect(events[0].v).toBe(label);
  });

  it("labels bundle size by character count, never the exact number", async () => {
    trackBundleSize(250_000);
    const events = await flush();
    expect(events[0].v).toBe("100001-1000000");
  });
});

describe("trackEntrySurface", () => {
  it.each([
    ["/", "home"],
    ["/for/legal", "for/legal"],
    ["/how-to/share-all-files-with-ai", "how-to/share-all-files-with-ai"],
  ])("records %s as %s", async (pathname, expected) => {
    trackEntrySurface(pathname);
    const events = await flush();
    expect(events[0].v).toBe(expected);
  });
});
