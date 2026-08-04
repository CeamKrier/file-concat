import { afterEach, describe, expect, it, vi } from "vitest";

import {
  METRICS_RETENTION_DAYS,
  pruneCounters,
  retentionCutoff,
} from "~/lib/metrics-retention";

/**
 * The retention window is a promise printed on `/privacy`, so the thing worth
 * pinning is that the number stated and the number enforced come from the same
 * constant, and that a prune failure can never surface as anything but a log.
 */

const DAY = 24 * 60 * 60;

type Recorded = { sql: string; args: unknown[] };

/** Minimal stand-in for the D1 binding: records what it was asked to run. */
function fakeDb(behaviour: { changes?: number; throws?: boolean } = {}) {
  const calls: Recorded[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              calls.push({ sql, args });
              if (behaviour.throws) throw new Error("D1 unavailable");
              return { meta: { changes: behaviour.changes ?? 0 } };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retentionCutoff", () => {
  it("is exactly the published window behind now", () => {
    const now = 1_800_000_000_000;
    expect(retentionCutoff(now)).toBe(Math.floor(now / 1000) - METRICS_RETENTION_DAYS * DAY);
  });

  it("keeps a row one day inside the window and drops one a day outside", () => {
    const now = 1_800_000_000_000;
    const cutoff = retentionCutoff(now);
    const nowSeconds = Math.floor(now / 1000);
    const justInside = nowSeconds - (METRICS_RETENTION_DAYS - 1) * DAY;
    const justOutside = nowSeconds - (METRICS_RETENTION_DAYS + 1) * DAY;

    expect(justInside < cutoff).toBe(false);
    expect(justOutside < cutoff).toBe(true);
  });
});

describe("pruneCounters", () => {
  it("deletes by the cutoff and reports how many rows went", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, calls } = fakeDb({ changes: 412 });

    const deleted = await pruneCounters(db, 1_800_000_000_000);

    expect(deleted).toBe(412);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe("DELETE FROM events WHERE ts < ?");
    expect(calls[0].args).toEqual([retentionCutoff(1_800_000_000_000)]);
  });

  it("stays quiet when there was nothing old enough to delete", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = fakeDb({ changes: 0 });

    expect(await pruneCounters(db)).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("swallows a database failure so a missed night is never an incident", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ throws: true });

    await expect(pruneCounters(db)).resolves.toBe(0);
    expect(error).toHaveBeenCalledOnce();
  });
});
