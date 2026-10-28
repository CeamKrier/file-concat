import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { track, tagOutcome, trackDeviceExports } = vi.hoisted(() => ({
  track: vi.fn(),
  tagOutcome: vi.fn(),
  trackDeviceExports: vi.fn(),
}));
vi.mock("~/lib/metrics", () => ({
  track,
  trackAmount: vi.fn(),
  trackDeviceExports,
  currentRun: () => 1,
}));
vi.mock("~/lib/clarity-tags", () => ({ tagOutcome, tagBundleReady: vi.fn() }));

import { useOutputGeneration } from "~/hooks/use-output-generation";

const inputs = {
  includedContents: [{ path: "notes.md", content: "# hello" }],
  excluded: {},
  tokens: 10,
  sourceUrl: null,
  outputStyle: "markdown" as const,
  formatPreference: "auto" as const,
  chunkSizeKB: 512,
};

/**
 * Share hands the bundle to the system share sheet on a phone. Pinned: it goes
 * out as a .txt, because Chrome refuses .md and .xml; it counts as `share`
 * only once a target was picked; and a closed sheet is not an outcome.
 */
describe("sharing the bundle", () => {
  let shared: File[];
  let share: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    track.mockClear();
    trackDeviceExports.mockClear();
    tagOutcome.mockClear();
    shared = [];
    share = vi.fn(async ({ files }: { files: File[] }) => {
      shared = files;
    });
    vi.stubGlobal("navigator", { ...navigator, share, canShare: () => true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends one .txt file and records share", async () => {
    const { result } = renderHook(() => useOutputGeneration(inputs));
    expect(result.current.canShareFiles).toBe(true);

    let ok = false;
    await act(async () => {
      ok = await result.current.share();
    });

    expect(ok).toBe(true);
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toMatch(/_fileconcat\.txt$/);
    expect(shared[0].type).toBe("text/plain");
    expect(await shared[0].text()).toContain("# hello");
    expect(track).toHaveBeenCalledWith("output_taken", "share");
    expect(trackDeviceExports).toHaveBeenCalledTimes(1);
    expect(tagOutcome).toHaveBeenCalledWith("shared");
  });

  it("records nothing when the sheet is closed", async () => {
    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
    const { result } = renderHook(() => useOutputGeneration(inputs));

    let ok = true;
    await act(async () => {
      ok = await result.current.share();
    });

    expect(ok).toBe(false);
    expect(track).not.toHaveBeenCalledWith("output_taken", "share");
    expect(tagOutcome).not.toHaveBeenCalled();
  });

  it("reports no file sharing where the browser has none", () => {
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined });
    const { result } = renderHook(() => useOutputGeneration(inputs));
    expect(result.current.canShareFiles).toBe(false);
  });
});
