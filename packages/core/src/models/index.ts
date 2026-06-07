// Type exports
export type {
  Modality,
  ModelCapabilities,
  ModelCost,
  ModelLimits,
  ModelModalities,
  AIModel,
  AIProvider,
  ModelsDevAPIResponse,
  ModelsRegistry,
  FilteredModel,
  CostEstimate,
} from "./types";

export {
  calculateCost,
  calculateBatchCosts,
  findCheapestModel,
  findFittingModels,
  formatCost,
} from "./cost-calculator";

export { dedupAndPruneModels, canonicalModelKey } from "./dedup";
export type { DedupAndPruneOptions } from "./dedup";
