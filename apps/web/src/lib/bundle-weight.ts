import { LARGE_BUNDLE_CHARS } from "./tokens";

/**
 * What a bundle's size means, on the two axes that actually constrain it.
 *
 * This replaces the per-file 32 MB cap that used to sit in ingestion. That cap
 * silently dropped the one big file most drops are about, and it answered the
 * wrong question: a byte count per file says nothing about whether the bundle
 * fits a model or whether the tab can carry it. So nothing is blocked any more
 * and both real constraints are reported instead.
 *
 * **Model fit** is relative to the chosen model's context window. The token
 * figure is approximate by construction (tiktoken is an OpenAI encoding, and
 * above `LARGE_BUNDLE_CHARS` it is a `chars / 4` forecast that *under*counts
 * code), so ADR-0010 requires headroom: amber starts at 80%, which also leaves
 * room for the prompt wrapped around the bundle and the model's own output.
 *
 * **Browser cost** is the axis the old cap was really guarding: tokenizing,
 * rendering and copying a multi-megabyte string. It is anchored to the same
 * `LARGE_BUNDLE_CHARS` the tokenizer switches at, so "large" means one thing
 * in this app.
 *
 * A **dominant file** is only worth naming when one of the above already
 * applies and a single file is most of the weight; there is no standalone
 * threshold at which a big file is interesting on its own.
 */

/** Share of the model's context window at which the fit turns amber. */
export const FIT_WARN_RATIO = 0.8;
/** Share of the bundle a single file must hold before it is worth naming. */
export const DOMINANT_FILE_RATIO = 0.3;

export type FitLevel = "fine" | "tight" | "over";

export type BundleWeight = {
  /** Total characters in the assembled bundle. */
  chars: number;
  /** Past `LARGE_BUNDLE_CHARS`: the token figure is a forecast and Copy is slow. */
  isLarge: boolean;
  /** Null when no model is known — never assume one. */
  fit: {
    level: FitLevel;
    /** tokens / contextLimit. Can exceed 1. */
    ratio: number;
    modelName: string;
    contextLimit: number;
  } | null;
  /** The single file carrying most of the weight, when anything else applies. */
  dominant: { path: string; share: number } | null;
  /**
   * What it costs to put this bundle in front of the model once, counting the
   * input side only. The reply is deliberately not in it: every guess at how
   * long an answer will be is a number we made up, and one invented figure
   * beside three measured ones is worse than no figure at all.
   *
   * Null when no model is known and when the catalogue has no price for it. A
   * missing price reads as 0 in `models.json`, and "$0.00" for a model somebody
   * pays for would be the worst kind of wrong.
   */
  prefill: { usd: number; modelName: string } | null;
  /** True when the result screen has something to say about size. */
  hasWarning: boolean;
};

export type WeighedFile = { path: string; content: string };

export type WeighInput = {
  files: WeighedFile[];
  tokens: number;
  /** The model the person picked, or null before one is known. */
  model: { name: string; contextLimit: number; inputCost?: number } | null;
};

export function weighBundle({ files, tokens, model }: WeighInput): BundleWeight {
  let chars = 0;
  let biggest: WeighedFile | null = null;
  for (const file of files) {
    chars += file.content.length;
    if (!biggest || file.content.length > biggest.content.length) biggest = file;
  }

  const isLarge = chars > LARGE_BUNDLE_CHARS;

  // `inputCost` is USD per million tokens, the models.dev unit the catalogue
  // carries through unchanged.
  const prefill =
    model && model.inputCost && model.inputCost > 0
      ? { usd: (tokens / 1_000_000) * model.inputCost, modelName: model.name }
      : null;

  // A context limit of 0 or less is missing data, not an infinitely small
  // window: reporting 100% of nothing would be a fabricated red state.
  const fit =
    model && model.contextLimit > 0
      ? {
          level: fitLevel(tokens / model.contextLimit),
          ratio: tokens / model.contextLimit,
          modelName: model.name,
          contextLimit: model.contextLimit,
        }
      : null;

  const somethingApplies = isLarge || (fit !== null && fit.level !== "fine");
  const share = biggest && chars > 0 ? biggest.content.length / chars : 0;
  const dominant =
    somethingApplies && biggest && share >= DOMINANT_FILE_RATIO
      ? { path: biggest.path, share }
      : null;

  return { chars, isLarge, fit, dominant, prefill, hasWarning: somethingApplies };
}

function fitLevel(ratio: number): FitLevel {
  if (ratio >= 1) return "over";
  if (ratio >= FIT_WARN_RATIO) return "tight";
  return "fine";
}
