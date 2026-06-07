import { createFileRoute } from "@tanstack/react-router";
import type { CatalogResponse, ModelsRegistry } from "@fileconcat/core";
import { buildTextModelsFromCatalog } from "@fileconcat/core";

const CATALOG_URL = "https://models.dev/catalog.json";

// Cache duration: 1 hour
const CACHE_MAX_AGE = 60 * 60;

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const response = await fetch(CATALOG_URL, {
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

          const catalog: CatalogResponse = await response.json();
          const textModels = buildTextModelsFromCatalog(catalog);
          const totalModels = Object.keys(catalog.models ?? {}).length;

          // Omit providers: clients never read it and it bloats the response.
          const registry: Omit<ModelsRegistry, "providers"> = {
            lastUpdated: new Date().toISOString(),
            totalModels,
            textModels,
          };

          return new Response(JSON.stringify(registry), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=86400`,
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
