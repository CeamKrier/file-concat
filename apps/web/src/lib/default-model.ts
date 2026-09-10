import { dedupAndPruneModels, type FilteredModel } from "@fileconcat/core";

import catalogue from "~/data/models.json";

/** Newest first, ties by name, undated models last. */
export function sortNewestFirst(models: readonly FilteredModel[]): FilteredModel[] {
  return models.slice().sort((a, b) => {
    const aDate = a.releaseDate ?? "";
    const bDate = b.releaseDate ?? "";
    if (aDate === bDate) return a.name.localeCompare(b.name);
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate.localeCompare(aDate);
  });
}

/**
 * The model the result screen measures against before anyone picks one: the
 * newest Sonnet, or the newest model when no Sonnet is listed. Sonnet rather
 * than the newest model because the fit warning is only honest against a
 * window someone plausibly targets, and a 200K window is the common case.
 */
export function pickDefaultModel(models: readonly FilteredModel[]): FilteredModel | null {
  return models.find((m) => m.name.toLowerCase().includes("sonnet")) ?? models[0] ?? null;
}

/**
 * The same choice made on the catalogue this build shipped, so a page can
 * quote the model and price the tool will show first. `fetch-models.ts`
 * rewrites the catalogue on every build, which is what keeps the quote current.
 */
export function defaultCatalogueModel(): FilteredModel | null {
  const models = catalogue.textModels as unknown as FilteredModel[];
  return pickDefaultModel(sortNewestFirst(dedupAndPruneModels(models)));
}
