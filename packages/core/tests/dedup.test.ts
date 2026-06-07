import { describe, it, expect } from "vitest";
import {
  dedupAndPruneModels,
  canonicalModelKey,
  type FilteredModel,
} from "../src";

function model(overrides: Partial<FilteredModel>): FilteredModel {
  return {
    uid: "test/x",
    id: "x",
    name: "x",
    providerId: "test",
    providerName: "Test",
    contextLimit: 200_000,
    outputLimit: 8_000,
    inputCost: 1,
    outputCost: 1,
    hasReasoning: false,
    hasToolCall: false,
    ...overrides,
  };
}

describe("canonicalModelKey", () => {
  it("collapses common variants of the same name", () => {
    expect(canonicalModelKey("Claude Sonnet 4.6")).toBe(canonicalModelKey("claude-sonnet-4.6"));
    expect(canonicalModelKey("GPT_5")).toBe(canonicalModelKey("gpt-5"));
    expect(canonicalModelKey("  Kimi K2.6  ")).toBe(canonicalModelKey("Kimi K2.6"));
  });

  it("preserves version dots", () => {
    expect(canonicalModelKey("glm-5.1")).not.toBe(canonicalModelKey("glm-5"));
  });
});

describe("dedupAndPruneModels", () => {
  it("collapses entries with the same canonical name to one", () => {
    const input: FilteredModel[] = [
      model({ uid: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", providerId: "anthropic", providerName: "Anthropic", inputCost: 3, outputCost: 15 }),
      model({ uid: "openrouter/claude-sonnet-4.6", name: "claude-sonnet-4.6", providerId: "openrouter", providerName: "OpenRouter", inputCost: 3, outputCost: 15 }),
      model({ uid: "vercel/claude-sonnet-4.6", name: "Claude Sonnet 4.6", providerId: "vercel", providerName: "Vercel AI Gateway", inputCost: 3, outputCost: 15 }),
    ];
    const result = dedupAndPruneModels(input);
    expect(result).toHaveLength(1);
  });

  it("prefers a first-party provider over resellers", () => {
    const input: FilteredModel[] = [
      model({ uid: "openrouter/claude", providerId: "openrouter", providerName: "OpenRouter", name: "Claude Sonnet 4.6", inputCost: 3, outputCost: 15 }),
      model({ uid: "anthropic/claude", providerId: "anthropic", providerName: "Anthropic", name: "Claude Sonnet 4.6", inputCost: 3, outputCost: 15 }),
      model({ uid: "cortecs/claude", providerId: "cortecs", providerName: "Cortecs", name: "Claude Sonnet 4.6", inputCost: 3.59, outputCost: 17.92 }),
    ];
    const [winner] = dedupAndPruneModels(input);
    expect(winner.providerId).toBe("anthropic");
  });

  it("picks the cheapest reseller when no first-party is present", () => {
    const input: FilteredModel[] = [
      model({ uid: "exp/kimi", providerId: "expensive-host", providerName: "Expensive", name: "Kimi K2.6", inputCost: 2, outputCost: 8 }),
      model({ uid: "cheap/kimi", providerId: "cheap-host", providerName: "Cheap", name: "Kimi K2.6", inputCost: 0.5, outputCost: 2 }),
      model({ uid: "mid/kimi", providerId: "mid-host", providerName: "Mid", name: "Kimi K2.6", inputCost: 1, outputCost: 4 }),
    ];
    const [winner] = dedupAndPruneModels(input);
    expect(winner.providerId).toBe("cheap-host");
  });

  it("drops free-plan entries when both costs are zero", () => {
    const input: FilteredModel[] = [
      model({ uid: "plan/free", providerId: "free-host", providerName: "Free Plan", name: "Some Model", inputCost: 0, outputCost: 0 }),
    ];
    expect(dedupAndPruneModels(input)).toHaveLength(0);
  });

  it("drops entries below the minimum context limit", () => {
    const input: FilteredModel[] = [
      model({ uid: "tiny/x", name: "Tiny Model", contextLimit: 8_000 }),
      model({ uid: "ok/x", name: "Sized Model", contextLimit: 32_768 }),
    ];
    const result = dedupAndPruneModels(input);
    expect(result.map((m) => m.uid)).toEqual(["ok/x"]);
  });

  it("falls back to a free first-party entry over a free reseller", () => {
    const input: FilteredModel[] = [
      model({ uid: "alibaba/x", providerId: "alibaba", providerName: "Alibaba", name: "Special Model", inputCost: 0, outputCost: 0 }),
      model({ uid: "openrouter/x", providerId: "openrouter", providerName: "OpenRouter", name: "Special Model", inputCost: 0, outputCost: 0 }),
    ];
    const [winner] = dedupAndPruneModels(input, { dropFreePlans: false });
    expect(winner.providerId).toBe("alibaba");
  });

  it("returns a deterministic order across calls", () => {
    const input: FilteredModel[] = [
      model({ uid: "a", name: "Beta" }),
      model({ uid: "b", name: "Alpha" }),
      model({ uid: "c", name: "Gamma" }),
    ];
    const a = dedupAndPruneModels(input).map((m) => m.name);
    const b = dedupAndPruneModels([...input].reverse()).map((m) => m.name);
    expect(a).toEqual(b);
  });
});
