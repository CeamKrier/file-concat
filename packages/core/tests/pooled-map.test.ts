import { describe, expect, it } from "vitest";
import { pooledMap } from "../src/sources/pooled-map";

describe("pooledMap", () => {
  it("maps every item and preserves input order", async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await pooledMap(items, 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("passes the item index to the mapper", async () => {
    const result = await pooledMap(["a", "b", "c"], 2, async (value, index) => `${index}:${value}`);
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("never runs more than the concurrency limit at once", async () => {
    const concurrency = 3;
    let active = 0;
    let maxActive = 0;

    await pooledMap(Array.from({ length: 12 }, (_, i) => i), concurrency, async (i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return i;
    });

    expect(maxActive).toBe(concurrency);
  });

  it("propagates a mapper rejection (so an abort inside the mapper stops the pool)", async () => {
    await expect(
      pooledMap([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("Aborted");
        return n;
      }),
    ).rejects.toThrow("Aborted");
  });

  it("returns an empty array for empty input without invoking the mapper", async () => {
    let calls = 0;
    const result = await pooledMap([], 4, async (n) => {
      calls++;
      return n;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });
});
