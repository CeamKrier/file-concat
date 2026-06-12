import type { FilteredModel } from "./types";

/**
 * Provider IDs treated as first-party for a given model name. When the same
 * model is served by several providers, the dedup function picks an entry
 * whose providerId appears in this set over a reseller / aggregator.
 *
 * Order does not matter; the set is membership-only. Aggregators (OpenRouter,
 * Together, Fireworks, Vercel AI Gateway, etc.) intentionally stay out.
 */
const FIRST_PARTY_PROVIDER_IDS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "azure",
  "google",
  "google-ai-studio",
  "vertex",
  "mistral",
  "mistralai",
  "meta",
  "meta-llama",
  "deepseek",
  "moonshotai",
  "moonshot",
  "zhipu",
  "zhipuai",
  "z-ai",
  "z.ai",
  "alibaba",
  "alibaba-cn",
  "xai",
  "x-ai",
  "cohere",
  "amazon-bedrock",
  "perplexity",
  "groq",
  "cerebras",
]);

export interface DedupAndPruneOptions {
  /** Drop entries whose contextLimit is below this. Default 16384. */
  minContextLimit?: number;
  /** Drop entries whose input and output cost are both 0 (free-plan tiers). Default true. */
  dropFreePlans?: boolean;
}

/**
 * Normalize a model name into a stable canonical key so that the same model
 * served by many providers collapses to one bucket. Lowercase, collapse
 * whitespace / underscores / dashes into single dashes, strip punctuation
 * except `.` (preserves versions like `4.6`).
 */
export function canonicalModelKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function isFirstParty(model: FilteredModel): boolean {
  return FIRST_PARTY_PROVIDER_IDS.has(model.providerId.toLowerCase());
}

function totalCost(model: FilteredModel): number {
  return model.inputCost + model.outputCost;
}

function isFreePlan(model: FilteredModel): boolean {
  return model.inputCost === 0 && model.outputCost === 0;
}

/**
 * Pick a winner among entries that share a canonical name.
 *
 * Tiers, in order:
 *   1. First-party providers with non-zero pricing.
 *   2. First-party providers with free pricing (last resort within tier 1).
 *   3. Resellers with non-zero pricing, cheapest total cost wins.
 *   4. Resellers with free pricing.
 *
 * Within a tier, ties are broken by larger contextLimit, then by stable order
 * (input order), so the result is deterministic across runs.
 */
function pickWinner(group: FilteredModel[]): FilteredModel {
  const tier = (m: FilteredModel): number => {
    if (isFirstParty(m) && !isFreePlan(m)) return 0;
    if (isFirstParty(m)) return 1;
    if (!isFreePlan(m)) return 2;
    return 3;
  };

  let best = group[0];
  let bestTier = tier(best);
  for (let i = 1; i < group.length; i++) {
    const candidate = group[i];
    const candidateTier = tier(candidate);
    if (candidateTier < bestTier) {
      best = candidate;
      bestTier = candidateTier;
      continue;
    }
    if (candidateTier > bestTier) continue;

    // Same tier. Tiers 0/2: cheapest combined cost wins.
    if (bestTier === 0 || bestTier === 2) {
      const candidateCost = totalCost(candidate);
      const bestCost = totalCost(best);
      if (candidateCost < bestCost) {
        best = candidate;
        continue;
      }
      if (candidateCost > bestCost) continue;
    }

    // Cost tie (or free tier): prefer the larger context window.
    if (candidate.contextLimit > best.contextLimit) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Collapse a flat list of FilteredModel entries (the shape used by the web app
 * and CLI alike) into one entry per canonical model name, dropping a few
 * categories that aren't useful for token-cost UX:
 *
 *   - models with a context limit below `minContextLimit` (default 16K)
 *   - models whose input AND output cost are both 0 (credit-plan stubs)
 *
 * Then for each remaining canonical group, pick one winner using the
 * provider-priority + cheapest-cost rules described on `pickWinner`.
 *
 * The result is sorted by canonical key for deterministic output.
 */
export function dedupAndPruneModels(
  models: readonly FilteredModel[],
  options: DedupAndPruneOptions = {},
): FilteredModel[] {
  const minContextLimit = options.minContextLimit ?? 16384;
  const dropFreePlans = options.dropFreePlans ?? true;

  const groups = new Map<string, FilteredModel[]>();
  for (const model of models) {
    if (model.contextLimit < minContextLimit) continue;
    if (dropFreePlans && isFreePlan(model)) continue;
    const key = canonicalModelKey(model.name);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(model);
    else groups.set(key, [model]);
  }

  const winners: FilteredModel[] = [];
  for (const group of groups.values()) {
    winners.push(pickWinner(group));
  }
  winners.sort((a, b) =>
    canonicalModelKey(a.name).localeCompare(canonicalModelKey(b.name)),
  );
  return winners;
}
