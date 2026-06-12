type Estimator = (text: string) => number;

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
