/**
 * How long product counters are kept (ADR-0014).
 *
 * One value, imported by both the worker that enforces it and the `/privacy`
 * page that states it, so the published number cannot drift from the enforced
 * one. ADR-0013 made the disclosure part of the decision rather than a follow-up;
 * this keeps that true mechanically instead of by remembering.
 *
 * Six months is two quarters, which is the cadence the format roadmap actually
 * moves on. Storage is not the constraint — a year of traffic at today's volume
 * is a rounding error against D1's limits — the constraint is that "we keep
 * anonymous counts forever" is a worse sentence than the one below, on a product
 * whose whole pitch is restraint about data.
 */
export const METRICS_RETENTION_DAYS = 180;

/** The cutoff `ts` for a prune run: rows older than this are deleted. */
export function retentionCutoff(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) - METRICS_RETENTION_DAYS * 24 * 60 * 60;
}

/**
 * Delete counters past the window, returning how many rows went. Lives here
 * rather than inline in the cron handler so it can be tested without a workerd
 * harness — the scheduled entry point itself is a two-line call.
 *
 * A failure is logged and swallowed: the next night prunes the same rows plus a
 * day's worth, so a missed run costs nothing, and nothing about a counter should
 * ever be able to surface as an incident.
 */
export async function pruneCounters(db: D1Database, nowMs: number = Date.now()): Promise<number> {
  try {
    const result = await db
      .prepare("DELETE FROM events WHERE ts < ?")
      .bind(retentionCutoff(nowMs))
      .run();
    const deleted = result.meta?.changes ?? 0;
    if (deleted > 0) {
      console.log(`Pruned ${deleted} counter rows older than ${METRICS_RETENTION_DAYS} days`);
    }
    return deleted;
  } catch (error) {
    console.error("Failed to prune counters:", error);
    return 0;
  }
}
