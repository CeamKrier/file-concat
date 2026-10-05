import { describe, expect, it } from "vitest";
import { newLines, scenePeaks, sceneTimes } from "~/lib/video-scenes";

const frame = (value: number) => new Uint8ClampedArray(64 * 64).fill(value);

describe("sceneTimes", () => {
  it("reads one frame from the middle of each scene", () => {
    // Three slides, 10 s each, with a little encoder noise.
    const thumbs = Array.from({ length: 30 }, (_, s) => {
      const f = frame(s < 10 ? 20 : s < 20 ? 120 : 200);
      f[s % 7] += 1;
      return f;
    });
    expect(sceneTimes(thumbs)).toEqual([5, 15, 24.5]);
  });

  it("catches a change too small for Docling's 0.012 floor", () => {
    // A new paragraph on the same background: 0.011 of the thumbnail moves.
    const diffs = [0, 0, 0, 0.011, 0, 0, 0, 0];
    expect(scenePeaks(diffs)).toEqual([3]);
    expect(scenePeaks(diffs, 0.012)).toEqual([]);
  });

  it("keeps the taller of two cuts closer than the distance", () => {
    expect(scenePeaks([0, 0.5, 0, 0.9, 0, 0, 0], 0.003, 3)).toEqual([3]);
  });

  it("has nothing to read in an empty video", () => {
    expect(sceneTimes([])).toEqual([]);
  });
});

describe("newLines", () => {
  it("keeps a slide once while the burned-in subtitle under it changes", () => {
    expect(
      newLines(["Chapter 1\nHello there", "Chapter 1\nGeneral Kenobi", "Chapter 1\nGeneral Kenobi"]),
    ).toEqual(["Chapter 1\nHello there", "General Kenobi", ""]);
  });
});
