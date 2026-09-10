import { useEffect, useState } from "react";
import type { FilteredModel } from "@fileconcat/core";

import { pickDefaultModel } from "~/lib/default-model";
import { useModels } from "./use-models";

export type ModelPicker = ReturnType<typeof useSelectedModel>;

/**
 * Which model the cost and context-fit figures are measured against.
 *
 * This used to be local state inside the settings drawer, where it was only
 * ever read by the cost estimate. The result screen now reports how much of
 * the model's context window a bundle fills, so the choice has to live above
 * both surfaces. Hoisting costs nothing: `useModels` reads a statically
 * imported `models.json` (or the localStorage cache) and never fetches on its
 * own, and the drawer is mounted unconditionally anyway.
 *
 * The default is `pickDefaultModel`, shared with the homepage so the price it
 * quotes is the one this screen shows first. Whatever it lands on, every
 * surface that shows a ratio also shows the model's name: a percentage of an
 * unnamed window would be a number nobody can check.
 */
export function useSelectedModel() {
  const { models, isLoading, lastUpdated, refresh } = useModels();
  const [selectedModel, setSelectedModel] = useState<FilteredModel | null>(null);

  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    setSelectedModel(pickDefaultModel(models));
  }, [models, selectedModel]);

  return { models, selectedModel, setSelectedModel, isLoading, lastUpdated, refresh };
}
