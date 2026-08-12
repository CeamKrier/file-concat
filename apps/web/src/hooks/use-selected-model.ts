import { useEffect, useState } from "react";
import type { FilteredModel } from "@fileconcat/core";

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
 * The default leans Sonnet rather than the newest model, because the fit
 * warning is only honest if it is measured against a window someone plausibly
 * targets, and a 200K window is the common case. Whatever it lands on, every
 * surface that shows a ratio also shows the model's name: a percentage of an
 * unnamed window would be a number nobody can check.
 */
export function useSelectedModel() {
  const { models, isLoading, lastUpdated, refresh } = useModels();
  const [selectedModel, setSelectedModel] = useState<FilteredModel | null>(null);

  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    const preferred = models.find((m) => m.name.toLowerCase().includes("sonnet")) ?? models[0];
    setSelectedModel(preferred);
  }, [models, selectedModel]);

  return { models, selectedModel, setSelectedModel, isLoading, lastUpdated, refresh };
}
