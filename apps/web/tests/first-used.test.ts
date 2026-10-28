import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { firstUsedBand, firstUsedOff, setFirstUsedOff } from "~/lib/first-used";

/**
 * The band is the one counter that reads device storage, so the contract worth
 * pinning is what it may store and when: a date written once and never
 * refreshed, a 13-month lifetime, and nothing at all once the visitor opts out.
 */

const KEY = "fileconcat-first-used";
const at = (day: string) => new Date(`${day}T12:00:00Z`);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("firstUsedBand", () => {
  it("writes today on the first page load and reports new", () => {
    expect(firstUsedBand(at("2026-10-28"))).toBe("new");
    expect(localStorage.getItem(KEY)).toBe("2026-10-28");
  });

  it.each([
    ["2026-10-28", "d0"],
    ["2026-10-29", "d1-7"],
    ["2026-11-04", "d1-7"],
    ["2026-11-05", "d8-30"],
    ["2026-11-27", "d8-30"],
    ["2026-11-28", "d31+"],
  ])("on %s reports %s and never refreshes the date", (day, band) => {
    localStorage.setItem(KEY, "2026-10-28");
    expect(firstUsedBand(at(day))).toBe(band);
    expect(localStorage.getItem(KEY)).toBe("2026-10-28");
  });

  it("replaces the date once it is older than 13 months", () => {
    localStorage.setItem(KEY, "2025-09-27");
    expect(firstUsedBand(at("2026-10-28"))).toBe("d31+");
    expect(localStorage.getItem(KEY)).toBe("2026-10-28");
  });

  it.each(["garbage", "2026-13-45", "2026-11-01"])("treats %s as absent", (stored) => {
    localStorage.setItem(KEY, stored);
    expect(firstUsedBand(at("2026-10-28"))).toBe("new");
    expect(localStorage.getItem(KEY)).toBe("2026-10-28");
  });

  it("opting out deletes the date and reports off without writing one", () => {
    localStorage.setItem(KEY, "2026-10-01");
    setFirstUsedOff(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(firstUsedBand(at("2026-10-28"))).toBe("off");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(firstUsedOff()).toBe(true);

    setFirstUsedOff(false);
    expect(firstUsedOff()).toBe(false);
    expect(firstUsedBand(at("2026-10-28"))).toBe("new");
  });

  it("Global Privacy Control reports off and touches no storage", () => {
    vi.stubGlobal("navigator", { ...navigator, globalPrivacyControl: true });
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem: getItem, removeItem: getItem });
    expect(firstUsedBand(at("2026-10-28"))).toBe("off");
    expect(getItem).not.toHaveBeenCalled();
  });

  it("reports none when storage throws", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(firstUsedBand(at("2026-10-28"))).toBe("none");
    expect(firstUsedOff()).toBeNull();
  });
});
