/**
 * Default fan-out for per-file remote downloads. High enough to saturate a
 * fast connection, low enough to stay well under host rate limits and avoid
 * the silent-throttle drops unbounded `Promise.all` caused (ADR-0004).
 */
export const DEFAULT_DOWNLOAD_CONCURRENCY = 12;

/**
 * Map `items` through an async `mapper` with at most `concurrency` calls in
 * flight at once, preserving input order in the returned array.
 *
 * Unbounded `Promise.all(items.map(...))` is what let large repos hammer a
 * host with thousands of simultaneous requests and get throttled into silent
 * partial downloads (see ADR-0004). This bounds the fan-out to a fixed pool.
 *
 * If `mapper` rejects, the rejection propagates so an abort inside the mapper
 * stops the pool. Per-item error handling (skip a file, collect a failure) is
 * the mapper's responsibility — it should not throw for a recoverable miss.
 */
export async function pooledMap<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
