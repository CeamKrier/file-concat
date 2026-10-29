import { describe, expect, it } from "vitest";
import { chunk, nextSlot, pickNext, validYouTubeId } from "../src/queue";
import { playability, readClientVersion } from "../src/youtube-clip";
import type { Clipping } from "../src/markdown";
import type { TrayItem } from "../src/messages";

describe("nextSlot", () => {
  it("spaces each slot at least base and at most twice base after the last", () => {
    expect(nextSlot(1000, 1000, 500, 0)).toEqual({ wait: 500, at: 1500 });
    expect(nextSlot(1000, 1000, 500, 1)).toEqual({ wait: 1000, at: 2000 });
  });

  it("still leaves a full gap after a slow answer", () => {
    expect(nextSlot(10_000, 1000, 500, 0.5)).toEqual({ wait: 750, at: 10_750 });
  });

  it("queues concurrent callers behind each other rather than together", () => {
    let last = 0;
    const slots = [0, 1, 2].map(() => {
      const slot = nextSlot(1000, last, 500, 0);
      last = slot.at;
      return slot.at;
    });
    expect(slots).toEqual([1500, 2000, 2500]);
  });
});

const row = (id: string, addedAt: number, state: TrayItem["state"] = "queued"): TrayItem => ({
  id,
  title: id,
  state,
  addedAt,
});

describe("pickNext", () => {
  it("takes the oldest batch first, in its own order", () => {
    // Newest batch first, as `write` keeps the tray.
    const tray = [row("new-1", 20), row("new-2", 20), row("old-1", 10, "done"), row("old-2", 10), row("old-3", 10)];
    expect(pickNext(tray)?.id).toBe("old-2");
  });

  it("answers nothing when nothing is queued", () => {
    expect(pickNext([row("a", 1, "done"), row("b", 1, "failed"), row("c", 1, "fetching")])).toBeUndefined();
  });
});

const clip = (chars: number): { clipping: Clipping } => ({
  clipping: { path: "a.md", markdown: "x".repeat(chars), source: "", clippedAt: 0 },
});

describe("chunk", () => {
  it("keeps every push within the file cap", () => {
    const chunks = chunk(Array.from({ length: 450 }, () => clip(10)), 200, 1_000_000);
    expect(chunks.map((part) => part.length)).toEqual([200, 200, 50]);
  });

  it("keeps every push within the character cap, in order", () => {
    const rows = [clip(60), clip(50), clip(40), clip(70)];
    const chunks = chunk(rows, 200, 100);
    expect(chunks.map((part) => part.map((r) => r.clipping.markdown.length))).toEqual([[60], [50, 40], [70]]);
  });

  it("still sends a file past the character cap, alone", () => {
    expect(chunk([clip(10), clip(500), clip(10)], 200, 100).map((part) => part.length)).toEqual([1, 1, 1]);
  });

  it("drops nothing", () => {
    const rows = Array.from({ length: 333 }, (_, n) => clip(n));
    expect(chunk(rows, 200, 10_000).flat()).toEqual(rows);
  });
});

describe("validYouTubeId", () => {
  it("takes video and playlist ids and refuses anything that could compose a request", () => {
    expect(validYouTubeId("dQw4w9WgXcQ")).toBe(true);
    expect(validYouTubeId("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBe(true);
    expect(validYouTubeId("../player")).toBe(false);
    expect(validYouTubeId("")).toBe(false);
    expect(validYouTubeId("a".repeat(65))).toBe(false);
  });
});

describe("readClientVersion", () => {
  it("reads the version out of the page's inline config", () => {
    expect(readClientVersion('x"INNERTUBE_CLIENT_VERSION":"2.20261028.01.00"y')).toBe("2.20261028.01.00");
  });

  it("refuses a value that is not a version", () => {
    expect(readClientVersion('"INNERTUBE_CLIENT_VERSION":"2.x</script>"')).toBeUndefined();
    expect(readClientVersion("nothing here")).toBeUndefined();
  });
});

describe("playability", () => {
  it("passes a playable video", () => {
    expect(playability({ playabilityStatus: { status: "OK" } })).toBeUndefined();
    expect(playability({})).toBeUndefined();
  });

  it("reads the bot check as a stop for the whole queue", () => {
    const error = playability({
      playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" },
    });
    expect(error?.kind).toBe("bot");
  });

  it("lets every other status through, since a cookieless player says UNPLAYABLE for ordinary videos", () => {
    expect(playability({ playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable" } })).toBeUndefined();
    expect(playability({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "This video is private" } })).toBeUndefined();
  });
});
