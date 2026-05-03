import { describe, expect, it } from "vitest";
import {
  calculateBatchCosts,
  calculateCost,
  findCheapestModel,
  findFittingModels,
  formatCost,
} from "../src/models/cost-calculator";
import type { FilteredModel } from "../src/models/types";

const baseModel: FilteredModel = {
  uid: "provider/model-a",
  id: "model-a",
  name: "Model A",
  providerId: "provider",
  providerName: "Provider",
  contextLimit: 100_000,
  outputLimit: 20_000,
  inputCost: 2,
  outputCost: 10,
  hasReasoning: false,
  hasToolCall: false,
};

describe("calculateCost", () => {
  it("uses output ratio by default", () => {
    const estimate = calculateCost(baseModel, { inputTokens: 10_000 });

    expect(estimate.estimatedOutputTokens).toBe(1_000);
    expect(estimate.inputCost).toBeCloseTo(0.02, 6);
    expect(estimate.outputCost).toBeCloseTo(0.01, 6);
    expect(estimate.totalCost).toBeCloseTo(0.03, 6);
  });

  it("respects explicit output tokens", () => {
    const estimate = calculateCost(baseModel, { inputTokens: 10_000, outputTokens: 500 });

    expect(estimate.estimatedOutputTokens).toBe(500);
    expect(estimate.outputCost).toBeCloseTo(0.005, 6);
  });
});

describe("calculateBatchCosts", () => {
  it("sorts results by total cost", () => {
    const cheaper: FilteredModel = { ...baseModel, uid: "provider/model-b", inputCost: 1 };
    const results = calculateBatchCosts([baseModel, cheaper], { inputTokens: 1_000 });

    expect(results[0].model.uid).toBe("provider/model-b");
    expect(results[1].model.uid).toBe("provider/model-a");
  });
});

describe("findCheapestModel", () => {
  it("returns the cheapest model that fits context", () => {
    const large: FilteredModel = { ...baseModel, uid: "provider/model-c", contextLimit: 20_000 };
    const small: FilteredModel = {
      ...baseModel,
      uid: "provider/model-d",
      contextLimit: 5_000,
      inputCost: 0.5,
    };

    const result = findCheapestModel([large, small], 10_000);

    expect(result?.uid).toBe("provider/model-c");
  });

  it("returns null when no model fits", () => {
    const result = findCheapestModel([baseModel], 200_000);

    expect(result).toBeNull();
  });
});

describe("findFittingModels", () => {
  it("filters and sorts by input cost", () => {
    const models: FilteredModel[] = [
      { ...baseModel, uid: "provider/model-e", contextLimit: 50_000, inputCost: 3 },
      { ...baseModel, uid: "provider/model-f", contextLimit: 50_000, inputCost: 1 },
      { ...baseModel, uid: "provider/model-g", contextLimit: 10_000, inputCost: 0.5 },
    ];

    const result = findFittingModels(models, 30_000);

    expect(result.map((model) => model.uid)).toEqual(["provider/model-f", "provider/model-e"]);
  });
});

describe("formatCost", () => {
  it("formats thresholds as expected", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0005)).toBe("$0.000500");
    expect(formatCost(0.005)).toBe("$0.0050");
    expect(formatCost(0.5)).toBe("$0.500");
    expect(formatCost(1.5)).toBe("$1.50");
  });
});
