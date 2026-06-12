import { describe, it, expect } from "vitest";
import {
  buildTextModelsFromCatalog,
  type AIProvider,
  type CatalogModel,
  type CatalogResponse,
} from "../src";

function catalogModel(overrides: Partial<CatalogModel>): CatalogModel {
  return {
    id: "lab/x",
    name: "X",
    family: "x",
    attachment: false,
    reasoning: false,
    tool_call: true,
    temperature: true,
    release_date: "2025-01-01",
    last_updated: "2025-01-01",
    modalities: { input: ["text"], output: ["text"] },
    open_weights: false,
    limit: { context: 200_000, output: 8_000 },
    ...overrides,
  };
}

function provider(id: string, name: string, models: AIProvider["models"]): AIProvider {
  return { id, name, env: [], models };
}

describe("buildTextModelsFromCatalog", () => {
  it("joins each canonical model to its cheapest priced provider", () => {
    const catalog: CatalogResponse = {
      models: {
        "anthropic/claude-sonnet-4.6": catalogModel({
          id: "anthropic/claude-sonnet-4.6",
          name: "Claude Sonnet 4.6",
          release_date: "2026-02-17",
        }),
      },
      providers: {
        anthropic: provider("anthropic", "Anthropic", {
          "claude-sonnet-4.6": {
            id: "claude-sonnet-4.6",
            name: "Claude Sonnet 4.6",
            family: "claude",
            attachment: true,
            reasoning: false,
            tool_call: true,
            temperature: true,
            modalities: { input: ["text"], output: ["text"] },
            open_weights: false,
            cost: { input: 3, output: 15 },
            limit: { context: 200_000, output: 8_000 },
          },
        }),
        poe: provider("poe", "Poe", {
          "claude-sonnet-4.6": {
            id: "claude-sonnet-4.6",
            name: "Claude Sonnet 4.6",
            family: "claude",
            attachment: true,
            reasoning: false,
            tool_call: true,
            temperature: true,
            modalities: { input: ["text"], output: ["text"] },
            open_weights: false,
            cost: { input: 2.6, output: 13 },
            limit: { context: 200_000, output: 8_000 },
          },
        }),
      },
    };
    const [winner] = buildTextModelsFromCatalog(catalog);
    expect(winner.providerId).toBe("poe");
    expect(winner.inputCost).toBe(2.6);
    expect(winner.uid).toBe("anthropic/claude-sonnet-4.6");
    expect(winner.releaseDate).toBe("2026-02-17");
  });

  it("sorts the output by release_date descending", () => {
    const catalog: CatalogResponse = {
      models: {
        old: catalogModel({ id: "old", name: "Old", release_date: "2024-05-01" }),
        new: catalogModel({ id: "new", name: "New", release_date: "2026-04-21" }),
        mid: catalogModel({ id: "mid", name: "Mid", release_date: "2025-12-01" }),
      },
      providers: {
        host: provider("host", "Host", {
          old: { ...catalogModel({}), id: "old", name: "Old", cost: { input: 1, output: 1 } } as never,
          new: { ...catalogModel({}), id: "new", name: "New", cost: { input: 1, output: 1 } } as never,
          mid: { ...catalogModel({}), id: "mid", name: "Mid", cost: { input: 1, output: 1 } } as never,
        }),
      },
    };
    const out = buildTextModelsFromCatalog(catalog).map((m) => m.uid);
    expect(out).toEqual(["new", "mid", "old"]);
  });

  it("drops canonical models with no priced provider offering", () => {
    const catalog: CatalogResponse = {
      models: {
        "lab/orphan": catalogModel({ id: "lab/orphan", name: "Orphan" }),
      },
      providers: {
        host: provider("host", "Host", {
          orphan: {
            ...catalogModel({}),
            id: "orphan",
            name: "Orphan",
            cost: { input: 0, output: 0 },
          } as never,
        }),
      },
    };
    expect(buildTextModelsFromCatalog(catalog)).toEqual([]);
  });

  it("drops canonical models whose context window is below the floor", () => {
    const catalog: CatalogResponse = {
      models: {
        tiny: catalogModel({ id: "tiny", name: "Tiny", limit: { context: 8_000, output: 1_000 } }),
        ok: catalogModel({ id: "ok", name: "OK", limit: { context: 32_768, output: 2_000 } }),
      },
      providers: {
        host: provider("host", "Host", {
          tiny: { ...catalogModel({}), id: "tiny", name: "Tiny", cost: { input: 1, output: 1 } } as never,
          ok: { ...catalogModel({}), id: "ok", name: "OK", cost: { input: 1, output: 1 } } as never,
        }),
      },
    };
    const out = buildTextModelsFromCatalog(catalog).map((m) => m.uid);
    expect(out).toEqual(["ok"]);
  });

  it("matches provider models to canonical models by normalized name", () => {
    const catalog: CatalogResponse = {
      models: {
        "moonshotai/kimi-k2": catalogModel({
          id: "moonshotai/kimi-k2",
          name: "Kimi K2.6",
          release_date: "2026-04-21",
        }),
      },
      providers: {
        vultr: provider("vultr", "Vultr", {
          "kimi-k2-thinking": {
            id: "kimi-k2-thinking",
            name: "Kimi K2.6",
            family: "kimi",
            attachment: false,
            reasoning: true,
            tool_call: true,
            temperature: true,
            modalities: { input: ["text"], output: ["text"] },
            open_weights: true,
            cost: { input: 0.15, output: 0.6 },
            limit: { context: 200_000, output: 8_000 },
          },
        }),
      },
    };
    const [winner] = buildTextModelsFromCatalog(catalog);
    expect(winner.providerId).toBe("vultr");
    expect(winner.inputCost).toBe(0.15);
  });
});
