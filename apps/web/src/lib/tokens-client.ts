import { encoding_for_model, type TiktokenModel } from "@dqbd/tiktoken";
import { LARGE_BUNDLE_CHARS } from "./tokens";

const TOKEN_MODEL: TiktokenModel = "o1-preview-2024-09-12";

/**
 * How the estimate is built above {@link LARGE_BUNDLE_CHARS}: this many evenly
 * spaced slices of this many characters each, tokenized for real, then scaled
 * to the whole text by the ratio they show.
 *
 * 256 KiB in total, whatever the bundle's size, so the cost stays flat where
 * the old whole-bundle path grew without limit. Evenly spaced because a bundle
 * is not homogeneous: a prefix sample would read the first few files and call
 * the rest of the repository the same thing.
 *
 * How that budget is spent was measured, not guessed. On the four repositories
 * a first 16 x 16 KiB configuration did worst on, holding the budget fixed and
 * cutting the slices smaller moved the mean absolute error 8.14% -> 2.82% ->
 * 1.30% -> 0.79% and the worst case 17.0% -> 8.7% -> 1.9% -> 1.3% across
 * 16 x 16 KiB, 32 x 8 KiB, 64 x 4 KiB and 128 x 2 KiB. Coverage is what the
 * error is made of. 64 x 4 KiB is taken rather than the marginally better
 * 128 x 2 KiB because each slice cuts two tokens in half at its edges, a bias
 * that grows with the slice count while the gain past here is inside the noise
 * of a four-repository comparison.
 */
const SAMPLE_SLICES = 64;
const SLICE_CHARS = 4 * 1024;

/**
 * Measure the ratio instead of assuming one.
 *
 * The old fallback here was characters / 4, which is an English-prose ratio.
 * Measured on 2026-09-07 over 60 public repositories, it ran a median 13.5%
 * off on the 30 bundles large enough to reach it and 62.5% off on a repository
 * written in Chinese, where a character is closer to one token than to four.
 * It read low far more often than high: median signed error -5.0% over the
 * sample. Sampling costs about as much as tokenizing a quarter of the old
 * threshold and carries no assumption about what the text is made of.
 * Every figure here is printed by `analyze-repo-funnel.ts`.
 */
function estimateBySampling(enc: ReturnType<typeof encoding_for_model>, text: string): number {
  const stride = Math.floor(text.length / SAMPLE_SLICES);
  let sampledChars = 0;
  let sampledTokens = 0;
  for (let i = 0; i < SAMPLE_SLICES; i++) {
    const slice = text.slice(i * stride, i * stride + SLICE_CHARS);
    if (slice.length === 0) continue;
    sampledChars += slice.length;
    sampledTokens += enc.encode(slice).length;
  }
  // Only reachable if every slice came back empty, which the caller's length
  // check already rules out. Kept so the function has no division by zero.
  if (sampledChars === 0) return Math.ceil(text.length / 4);
  return Math.ceil((text.length * sampledTokens) / sampledChars);
}

export function estimateTokenCount(text: string): number {
  let enc: ReturnType<typeof encoding_for_model> | null = null;
  try {
    enc = encoding_for_model(TOKEN_MODEL);
    // Above the threshold, tokenizing the whole bundle is too slow and
    // memory-heavy in the browser, so the count is extrapolated from samples
    // rather than taken (ADR-0010).
    if (text.length > LARGE_BUNDLE_CHARS) return estimateBySampling(enc, text);
    return enc.encode(text).length;
  } catch (error) {
    console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
    return Math.ceil(text.length / 4);
  } finally {
    enc?.free();
  }
}
