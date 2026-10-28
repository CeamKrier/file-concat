import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The recap totals are the second value kept on the device, so the contract
 * worth pinning is the same as the first-use date's: what may be stored, that
 * one exported Run counts once, and that the opt-out and the date's lifetime
 * take the totals with them.
 */

const RECAP = "fileconcat-recap";
const DATE = "fileconcat-first-used";

let recap: typeof import("~/lib/recap");
let firstUsed: typeof import("~/lib/first-used");

beforeEach(async () => {
  localStorage.clear();
  // `recordedRun` is page-load state: a fresh module is a fresh page.
  vi.resetModules();
  recap = await import("~/lib/recap");
  firstUsed = await import("~/lib/first-used");
});
afterEach(() => vi.unstubAllGlobals());

describe("recordExport", () => {
  it("adds counts only, and one exported Run once", () => {
    expect(recap.recordExport(1, ["src/a.ts", "docs/Read Me.PDF", "Makefile"], 1200.4)).toBe("1");
    expect(recap.recordExport(1, ["src/a.ts"], 99)).toBeNull();

    const stored = localStorage.getItem(RECAP) ?? "";
    expect(stored).not.toContain("src");
    expect(stored).not.toContain("Read Me");
    expect(JSON.parse(stored)).toEqual({
      exports: 1,
      files: 3,
      tokens: 1200,
      ext: { ts: 1, pdf: 1, none: 1 },
    });
  });

  it.each([
    [1, "1"],
    [2, "2-4"],
    [4, "2-4"],
    [5, "5-19"],
    [19, "5-19"],
    [20, "20+"],
  ])("after %i exports reports %s", (runs, band) => {
    let last: string | null = null;
    for (let run = 1; run <= runs; run++) last = recap.recordExport(run, ["a.md"], 10);
    expect(last).toBe(band);
  });

  it("folds extensions past 30 into other", () => {
    const paths = Array.from({ length: 40 }, (_, i) => `f.e${i}`);
    recap.recordExport(1, paths, 0);
    const ext = recap.readRecap().ext;
    expect(Object.keys(ext)).toHaveLength(31);
    expect(ext.other).toBe(10);
  });

  it("replaces corrupt totals instead of throwing", () => {
    localStorage.setItem(RECAP, '{"exports":"9","files":-1');
    expect(recap.recordExport(1, ["a.md"], 5)).toBe("1");
    localStorage.setItem(RECAP, '{"exports":3,"files":1,"tokens":1,"ext":{"md":"x"}}');
    expect(recap.readRecap().exports).toBe(0);
  });

  it("opting out deletes the totals and stops writing them", () => {
    recap.recordExport(1, ["a.md"], 5);
    firstUsed.setFirstUsedOff(true);
    expect(localStorage.getItem(RECAP)).toBeNull();
    expect(recap.recordExport(2, ["a.md"], 5)).toBe("off");
    expect(localStorage.getItem(RECAP)).toBeNull();
  });

  it("Global Privacy Control reads and writes nothing", () => {
    vi.stubGlobal("navigator", { ...navigator, globalPrivacyControl: true });
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem: getItem, removeItem: getItem });
    expect(recap.recordExport(1, ["a.md"], 5)).toBe("off");
    expect(getItem).not.toHaveBeenCalled();
  });

  it("reports none when storage throws", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(recap.recordExport(1, ["a.md"], 5)).toBe("none");
  });
});

describe("lifetime", () => {
  it("goes with the first-use date when it is written fresh or expires", () => {
    recap.recordExport(1, ["a.md"], 5);
    firstUsed.firstUsedBand(new Date("2026-10-28T12:00:00Z"));
    expect(localStorage.getItem(RECAP)).toBeNull();

    recap.recordExport(2, ["a.md"], 5);
    firstUsed.firstUsedBand(new Date("2026-11-05T12:00:00Z"));
    expect(localStorage.getItem(RECAP)).not.toBeNull();

    localStorage.setItem(DATE, "2025-09-27");
    firstUsed.firstUsedBand(new Date("2026-10-28T12:00:00Z"));
    expect(localStorage.getItem(RECAP)).toBeNull();
  });
});
