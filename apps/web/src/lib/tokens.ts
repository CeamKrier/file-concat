import { assembleOutput, type AssembleOutputOptions } from "@fileconcat/core";

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

/**
 * A bundle's estimate, taken as contents plus wrapper rather than over the
 * assembled string.
 *
 * Above {@link LARGE_BUNDLE_CHARS} the count is sampled, and that sampling
 * error, about 1%, is several times the difference between the three output
 * styles. Measured on 2026-09-09 over this repository's own 585 files, the
 * exact counts are XML 1,868,160, Markdown 1,865,440, Plain 1,865,387: a 0.15%
 * spread. Estimating the assembled string moved the sample slices with the
 * style, so on one of those bundles flipping XML to Plain raised the reported
 * number by 13,823 tokens while the true count fell by 2,764.
 *
 * The file contents do not depend on the style, so they are counted once. The
 * wrapper is small enough to be counted exactly. What is left is that the three
 * styles differ by exactly what they cost, which is what the format picker is
 * asking the reader to compare.
 */
export function estimateBundleTokens(options: AssembleOutputOptions): number {
  if (options.files.length === 0) return 0;
  // The same bundle with every file's content blanked: header, summary, tree
  // and the per-file markers, which is everything the style decides.
  const wrapper = assembleOutput({
    ...options,
    files: options.files.map((file) => ({ ...file, content: "" })),
  });
  // Joined on a newline because that is how each file's content sits in every
  // style: on its own line, between the markers the wrapper holds.
  const contents = options.files.map((file) => file.content).join("\n");
  return estimateTokenCount(contents) + estimateTokenCount(wrapper);
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
