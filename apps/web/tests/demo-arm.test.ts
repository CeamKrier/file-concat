import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/metrics", () => ({ track: vi.fn() }));

import { track } from "~/lib/metrics";
import { demoFor, pickArm, recordDemoPlay, resetDemoArmForTest, settleDemoArm } from "~/lib/demo-arm";

const CUTS = { "/how-to/claude-file-upload-limit": "claude", "/how-to/chatgpt-file-upload-limit": "chatgpt" } as const;
const CLAUDE = "/how-to/claude-file-upload-limit";
const CHATGPT = "/how-to/chatgpt-file-upload-limit";

function screen(matches: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches, media: q }));
}

beforeEach(() => {
  resetDemoArmForTest();
  vi.mocked(track).mockClear();
  screen(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("demo arm", () => {
  it("splits the unit interval in half", () => {
    expect(pickArm(0)).toBe("video");
    expect(pickArm(0.499)).toBe("video");
    expect(pickArm(0.5)).toBe("control");
    expect(pickArm(0.999)).toBe("control");
  });

  it("draws on the server, only for a page in the test", () => {
    vi.stubEnv("SSR", true);
    expect(demoFor(CLAUDE, CUTS, () => 0.1)).toEqual({ arm: "video", cut: "claude" });
    expect(demoFor(CHATGPT, CUTS, () => 0.9)).toEqual({ arm: "control", cut: "chatgpt" });
    expect(demoFor("/how-to/upload-zip-to-chatgpt", CUTS, () => 0.1)).toBeNull();
  });

  it("never re-draws in the browser: a preload or client navigation keeps the landing arm", () => {
    const draw = vi.fn(() => 0.9);
    settleDemoArm("video");
    expect(demoFor(CHATGPT, CUTS, draw)).toEqual({ arm: "video", cut: "chatgpt" });
    expect(demoFor(CLAUDE, CUTS, draw)).toEqual({ arm: "video", cut: "claude" });
    expect(draw).not.toHaveBeenCalled();
  });

  it("keeps a visit that landed outside the test out of it", () => {
    expect(demoFor(CLAUDE, CUTS)).toBeNull();
  });

  it("counts the arm once per load, and the first landing arm wins", () => {
    settleDemoArm("control");
    settleDemoArm("video");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("demo_arm", "control");
    expect(demoFor(CLAUDE, CUTS)?.arm).toBe("control");
  });

  it("does not count a screen that cannot show the demo, in either arm", () => {
    screen(false);
    settleDemoArm("video");
    expect(track).not.toHaveBeenCalled();
    expect(demoFor(CLAUDE, CUTS)?.arm).toBe("video");
  });

  it("counts the first play only", () => {
    recordDemoPlay();
    recordDemoPlay();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("demo_play", "start");
  });
});
