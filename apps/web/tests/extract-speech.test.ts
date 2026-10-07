import { describe, expect, it } from "vitest";
import { quietCuts, speechModelFor, timestamp } from "~/lib/extract-speech-client";

describe("quietCuts", () => {
  it("cuts at the quietest point between 20 and 30 seconds, never past 30", () => {
    const RATE = 16000;
    // 70 s of noise with a silent gap at 24 s and another at 49 s.
    const audio = new Float32Array(70 * RATE).map((_, i) => (i % 2 ? 0.5 : -0.5));
    audio.fill(0, 24 * RATE, 24 * RATE + RATE / 10);
    audio.fill(0, 49 * RATE, 49 * RATE + RATE / 10);
    const pieces = quietCuts(audio);
    const lengths = pieces.map((p) => p.length / RATE);
    expect(lengths.every((s) => s <= 30)).toBe(true);
    expect(lengths[0]).toBeGreaterThanOrEqual(24);
    expect(lengths[0]).toBeLessThan(24.1);
    expect(pieces.reduce((n, p) => n + p.length, 0)).toBe(audio.length);
  });

  it("leaves anything up to 30 seconds whole", () => {
    expect(quietCuts(new Float32Array(30 * 16000))).toHaveLength(1);
  });
});

describe("speech model and stamps", () => {
  it("reads English with Moonshine and every other language with Whisper by its primary subtag", () => {
    expect(speechModelFor("en-GB").model).toContain("moonshine");
    expect(speechModelFor("tr-TR")).toEqual({ model: "onnx-community/whisper-small", language: "tr" });
    expect(speechModelFor("zh-Hant")).toMatchObject({ language: "zh" });
  });

  it("stamps minutes, and hours past the hour", () => {
    expect(timestamp(65.9)).toBe("[1:05]");
    expect(timestamp(3725)).toBe("[1:02:05]");
  });
});
