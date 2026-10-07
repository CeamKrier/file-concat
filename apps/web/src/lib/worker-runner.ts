/**
 * Run a wasm reader in a dedicated worker, one message at a time. Shared by
 * the fallback readers (anydoc, 7-Zip): a wasm trap can leave an instance
 * answering "unreachable" to every later call (measured with anydoc in the
 * extraction eval, 2026-10-05), so the worker is terminated after any failure
 * and the next call starts a fresh one. A reader that never returns would stall
 * the whole drop, hence the time limit.
 *
 * The worker answers `{ result }` or `{ error }`.
 */
export function workerRunner<In, Out>(
  create: () => Worker,
  timeoutMs: number,
): (input: In, transfer?: Transferable[]) => Promise<Out> {
  let worker: Worker | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const once = (input: In, transfer: Transferable[]) => {
    worker ??= create();
    const current = worker;
    return new Promise<Out>((resolve, reject) => {
      const fail = (error: Error) => {
        clearTimeout(timer);
        current.terminate();
        if (worker === current) worker = null;
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error("worker timed out")), timeoutMs);
      current.onmessage = ({ data }: MessageEvent<{ result?: Out; error?: string }>) => {
        if (data.error !== undefined) return fail(new Error(data.error));
        clearTimeout(timer);
        resolve(data.result as Out);
      };
      current.onerror = (event) => fail(new Error(event.message || "worker failed"));
      current.postMessage(input, transfer);
    });
  };

  // The worker answers whichever message it got last, so calls wait their turn.
  return (input, transfer = []) => {
    const run = queue.then(() => once(input, transfer));
    queue = run.catch(() => undefined);
    return run;
  };
}
