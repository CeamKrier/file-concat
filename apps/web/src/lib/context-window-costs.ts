import type { FilteredModel } from "@fileconcat/core";

import catalogue from "~/data/models.json";

/**
 * The pricing behind `/docs/context-window-costs`.
 *
 * Every figure on that page is derived from `~/data/models.json`, which
 * `apps/web/scripts/fetch-models.ts` regenerates from models.dev on every
 * build. Nothing is a prop typed by hand, so the page cannot go stale against
 * the catalogue and a reader can check any number by reading the file.
 *
 * Kept out of the component file so the arithmetic can be tested on a fixture
 * rather than on a catalogue whose values change on every deploy.
 */

/**
 * The sizes the page prices. 236,218 is not a round number on purpose: it is
 * the median bundle across the 60 public repositories measured on 2026-09-11
 * and published in `/blog/how-many-tokens-is-a-codebase`, so one row prices a
 * real project rather than a convenient one.
 */
export const BUCKETS = [100_000, 236_218, 500_000, 1_000_000];

export const MODELS = catalogue.textModels as unknown as FilteredModel[];
export const SNAPSHOT = catalogue.lastUpdated.slice(0, 10);

export interface PricedModel {
  model: FilteredModel;
  cost: number;
}

export interface BucketSummary {
  tokens: number;
  fitting: PricedModel[];
  cheapest: number;
  middle: number;
  dearest: number;
}

/** Even samples take the mean of the two middle values, not the upper one. */
function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 1048576 reads as 1.05M, 131072 as 131K. Raw digits make the column unreadable. */
export function formatWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions.toFixed(millions % 1 === 0 ? 0 : 2)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

/**
 * Price one context size against a model list. A model whose window is smaller
 * than the context is not priced at all: it cannot be asked the question, and a
 * price for an input it would reject is a number nobody can use.
 */
export function summarize(models: readonly FilteredModel[], tokens: number): BucketSummary {
  const fitting = models
    .filter((model) => model.contextLimit >= tokens)
    .map((model) => ({ model, cost: (tokens / 1_000_000) * model.inputCost }))
    .sort((a, b) => a.cost - b.cost || a.model.name.localeCompare(b.model.name));
  const costs = fitting.map((row) => row.cost);

  return {
    tokens,
    fitting,
    cheapest: costs[0] ?? 0,
    middle: medianOf(costs),
    dearest: costs[costs.length - 1] ?? 0,
  };
}

/**
 * Computed once per process rather than once per render: the catalogue is a
 * static import, so there is nothing for a hook to react to.
 */
export const SUMMARIES: BucketSummary[] = BUCKETS.map((tokens) => summarize(MODELS, tokens));
