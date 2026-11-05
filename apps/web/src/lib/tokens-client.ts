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
function estimateBySampling(enc: ReturnType<typeof encoding_for_model>, text: Sliceable): number {
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

/** What the sampler reads. A string is one; so is {@link joined}. */
interface Sliceable {
  length: number;
  slice(start: number, end: number): string;
}

/**
 * `parts.join("\n")`, read through `slice` without being built. V8 refuses a
 * string past about 512 Mi characters (`RangeError: Invalid string length`),
 * and a drop past that size hit exactly this on the join, which took the
 * whole page down (2026-11-04). The sampler only ever reads 64 slices of
 * 4 KiB, so it never needed the joined string.
 */
export function joined(parts: string[], separator = "\n"): Sliceable {
  const starts: number[] = [];
  let length = 0;
  for (const part of parts) {
    if (starts.length > 0) length += separator.length;
    starts.push(length);
    length += part.length;
  }
  return {
    length,
    slice(start, end) {
      end = Math.min(end, length);
      // The last part starting at or before `start`: the read begins inside it
      // or in the separator after it.
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= start) lo = mid;
        else hi = mid - 1;
      }
      let out = "";
      for (let i = lo; i < parts.length; i++) {
        const from = starts[i];
        if (i > 0) {
          const sepFrom = from - separator.length;
          if (sepFrom >= end) break;
          out += separator.slice(Math.max(0, start - sepFrom), Math.max(0, end - sepFrom));
        }
        if (from >= end) break;
        out += parts[i].slice(Math.max(0, start - from), Math.max(0, end - from));
      }
      return out;
    },
  };
}

// Built once and kept: building it parses the whole BPE table, about 65 ms,
// and a tree toggle used to pay that twice (contents and wrapper).
let encoder: ReturnType<typeof encoding_for_model> | null = null;

export function estimateTokenCount(text: string): number {
  try {
    const enc = (encoder ??= encoding_for_model(TOKEN_MODEL));
    // Above the threshold, tokenizing the whole bundle is too slow and
    // memory-heavy in the browser, so the count is extrapolated from samples
    // rather than taken (ADR-0010).
    if (text.length > LARGE_BUNDLE_CHARS) return estimateBySampling(enc, text);
    return enc.encode(text).length;
  } catch (error) {
    console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
    return Math.ceil(text.length / 4);
  }
}

/** The count of `parts.join("\n")`, without joining them above the threshold. */
export function estimateJoinedTokenCount(parts: string[]): number {
  const text = joined(parts);
  if (text.length <= LARGE_BUNDLE_CHARS) return estimateTokenCount(parts.join("\n"));
  try {
    return estimateBySampling((encoder ??= encoding_for_model(TOKEN_MODEL)), text);
  } catch (error) {
    console.warn("Token estimation failed (WASM error?), falling back to approximation", error);
    return Math.ceil(text.length / 4);
  }
}
