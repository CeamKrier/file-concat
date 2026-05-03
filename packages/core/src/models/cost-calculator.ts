import type { FilteredModel, CostEstimate } from "./types";

export interface CostCalculationOptions {
  /** Input token count */
  inputTokens: number;
  /** Output ratio (0-1), default 0.1 */
  outputRatio?: number;
  /** Fixed output tokens (overrides ratio) */
  outputTokens?: number;
}

/**
 * Calculate cost for a single model
 */
export function calculateCost(model: FilteredModel, options: CostCalculationOptions): CostEstimate {
  const { inputTokens, outputRatio = 0.1, outputTokens } = options;

  const estimatedOutputTokens = outputTokens ?? Math.round(inputTokens * outputRatio);
  const inputCost = (inputTokens / 1_000_000) * model.inputCost;
  const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputCost;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    model,
    inputTokens,
    estimatedOutputTokens,
  };
}

/**
 * Calculate costs for multiple models
 */
export function calculateBatchCosts(
  models: FilteredModel[],
  options: CostCalculationOptions,
): CostEstimate[] {
  return models
    .map((model) => calculateCost(model, options))
    .sort((a, b) => a.totalCost - b.totalCost);
}

/**
 * Find cheapest model that fits context
 */
export function findCheapestModel(
  models: FilteredModel[],
  inputTokens: number,
): FilteredModel | null {
  const validModels = models.filter((m) => m.contextLimit >= inputTokens);
  if (validModels.length === 0) return null;

  return validModels.reduce((cheapest, current) =>
    current.inputCost < cheapest.inputCost ? current : cheapest,
  );
}

/**
 * Find models that fit context
 */
export function findFittingModels(models: FilteredModel[], inputTokens: number): FilteredModel[] {
  return models
    .filter((m) => m.contextLimit >= inputTokens)
    .sort((a, b) => a.inputCost - b.inputCost);
}

/**
 * Format cost as currency string
 */
export function formatCost(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
