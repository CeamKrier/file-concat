#!/usr/bin/env npx tsx
/**
 * Build-time script to fetch AI models from models.dev API
 * Filters to only include text-input models
 * Saves to src/data/models.json as fallback data
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Types (inline to avoid import issues in script)
interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
}

interface ModelLimits {
  context: number;
  output: number;
}

interface AIModel {
  id: string;
  name: string;
  family: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  modalities: {
    input: string[];
    output: string[];
  };
  open_weights: boolean;
  cost: ModelCost;
  limit: ModelLimits;
}

interface AIProvider {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  doc?: string;
  models: Record<string, AIModel>;
}

interface FilteredModel {
  uid: string;
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  contextLimit: number;
  outputLimit: number;
  inputCost: number;
  outputCost: number;
  hasReasoning: boolean;
  hasToolCall: boolean;
}

interface ModelsRegistry {
  providers: Record<string, AIProvider>;
  lastUpdated: string;
  totalModels: number;
  textModels: FilteredModel[];
}

const MODELS_API_URL = "https://models.dev/api.json";
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const OUTPUT_FILE = join(OUTPUT_DIR, "models.json");

async function fetchModels(): Promise<Record<string, AIProvider>> {
  console.log("Fetching models from", MODELS_API_URL);

  const response = await fetch(MODELS_API_URL, {
    headers: {
      "User-Agent": "FileConcat/1.0 (https://fileconcat.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function filterTextModels(providers: Record<string, AIProvider>): FilteredModel[] {
  const textModels: FilteredModel[] = [];

  for (const [providerId, provider] of Object.entries(providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      // Filter: only models that support text input
      if (!model.modalities?.input?.includes("text")) {
        continue;
      }

      // Filter: only models that output text
      if (!model.modalities?.output?.includes("text")) {
        continue;
      }

      // Filter: skip models without cost info
      if (!model.cost) {
        continue;
      }

      // Filter: skip embedding models (no output cost usually)
      if (model.cost.output === 0 && model.name.toLowerCase().includes("embedding")) {
        continue;
      }

      // Filter: skip models with 0 context (invalid/placeholder)
      if (!model.limit?.context || model.limit.context === 0) {
        continue;
      }

      textModels.push({
        uid: `${providerId}/${modelId}`,
        id: modelId,
        name: model.name,
        providerId,
        providerName: provider.name,
        contextLimit: model.limit.context,
        outputLimit: model.limit.output,
        inputCost: model.cost.input,
        outputCost: model.cost.output,
        hasReasoning: model.reasoning ?? false,
        hasToolCall: model.tool_call ?? false,
      });
    }
  }

  // Sort by context limit (descending), then by input cost (ascending)
  textModels.sort((a, b) => {
    if (b.contextLimit !== a.contextLimit) {
      return b.contextLimit - a.contextLimit;
    }
    return a.inputCost - b.inputCost;
  });

  return textModels;
}

function countTotalModels(providers: Record<string, AIProvider>): number {
  let count = 0;
  for (const provider of Object.values(providers)) {
    count += Object.keys(provider.models).length;
  }
  return count;
}

async function main() {
  try {
    const providers = await fetchModels();
    const textModels = filterTextModels(providers);
    const totalModels = countTotalModels(providers);

    const registry: ModelsRegistry = {
      providers,
      lastUpdated: new Date().toISOString(),
      totalModels,
      textModels,
    };

    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write JSON file
    writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));

    console.log(
      `Success! Saved ${textModels.length} text models (${totalModels} total) to ${OUTPUT_FILE}`,
    );
    console.log(`Last updated: ${registry.lastUpdated}`);

    // Print some stats
    const providerCounts = new Map<string, number>();
    for (const model of textModels) {
      providerCounts.set(model.providerName, (providerCounts.get(model.providerName) || 0) + 1);
    }
    console.log("\nModels per provider:");
    for (const [provider, count] of [...providerCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${provider}: ${count}`);
    }
  } catch (error) {
    console.error("Error fetching models:", error);
    process.exit(1);
  }
}

main();
