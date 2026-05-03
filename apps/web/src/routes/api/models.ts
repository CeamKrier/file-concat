import { createFileRoute } from "@tanstack/react-router";
import type { FilteredModel, AIProvider, ModelsRegistry } from "@fileconcat/core";

const MODELS_API_URL = "https://models.dev/api.json";

// Cache duration: 1 hour
const CACHE_MAX_AGE = 60 * 60;

/**
 * Filter to only text-input/output models
 */
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

      // Filter: skip embedding models
      if (model.cost.output === 0 && model.name.toLowerCase().includes("embedding")) {
        continue;
      }

      // Filter: skip models with 0 context
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

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Fetch from models.dev
          const response = await fetch(MODELS_API_URL, {
            headers: {
              "User-Agent": "FileConcat/1.0 (https://fileconcat.com)",
            },
          });

          if (!response.ok) {
            return Response.json(
              {
                error: "Failed to fetch models",
                status: response.status,
              },
              { status: 502 },
            );
          }

          const providers: Record<string, AIProvider> = await response.json();
          const textModels = filterTextModels(providers);

          // Count total models
          let totalModels = 0;
          for (const provider of Object.values(providers)) {
            totalModels += Object.keys(provider.models).length;
          }

          const registry: ModelsRegistry = {
            providers,
            lastUpdated: new Date().toISOString(),
            totalModels,
            textModels,
          };

          return new Response(JSON.stringify(registry), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              // Cache for 1 hour on CDN, allow stale for 24h while revalidating
              "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=86400`,
              // Vary by Accept-Encoding for proper CDN caching
              Vary: "Accept-Encoding",
            },
          });
        } catch (error) {
          console.error("Error fetching models:", error);

          return Response.json(
            {
              error: "Internal server error",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
