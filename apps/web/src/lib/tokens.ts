type Estimator = (text: string) => number;

/**
 * Input size, in characters, at or below which we run the real tiktoken WASM
 * tokenizer over the whole bundle. Above it, tokenizing all of it is too slow
 * and memory-heavy in the browser, so the count is extrapolated from evenly
 * spaced samples that are tokenized for real — not from an assumed
 * characters-per-token ratio. See `tokens-client.ts`.
 *
 * One threshold, two jobs: it is also the anchor for the client-side
 * "large bundle" warning (render/copy/tokenize cost) — distinct from the
 * model-fit warning, which is relative to the selected model's context window.
 * See docs/adr/0010-token-forecast-above-large-bundle-threshold.md.
 */
export const LARGE_BUNDLE_CHARS = 1024 * 1024; // 1 MiB

function approximate(text: string): number {
  return Math.ceil(text.length / 4);
}

let realEstimator: Estimator | null = null;
let preloadPromise: Promise<void> | null = null;

export function estimateTokenCount(text: string): number {
  if (realEstimator) return realEstimator(text);
  return approximate(text);
}

export function preloadTokenEstimator(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  if (import.meta.env.SSR) {
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }
  preloadPromise = import("./tokens-client").then((m) => {
    realEstimator = m.estimateTokenCount;
  });
  return preloadPromise;
}
