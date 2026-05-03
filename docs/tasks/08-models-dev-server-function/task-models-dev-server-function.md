# Task 08: models.dev Server Function (Runtime Refresh)

## Ozet

TanStack Start server function olustur - client'tan "Refresh Models" istegi geldiginde models.dev API'sinden guncel veri cekip dondur.

## Oncelik

Yuksek (Faz 2 - Model Data)

## Bagimliliklari

- Task 06: Model Types (tamamlanmis)
- Task 03: Root Route (TanStack Start setup tamamlanmis)

## Basari Kriterleri

- [ ] `/api/models` endpoint'i calisiyor
- [ ] Veri dogru formatta donuyor
- [ ] CORS headers dogru
- [ ] Error handling mevcut
- [ ] Cache headers mevcut

## Detayli Adimlar

### 1. API Route Olusturma

**Dosya:** `apps/web/src/routes/api/models.ts` (yeni)

```typescript
import { createAPIFileRoute } from "@tanstack/react-start/api";
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

export const Route = createAPIFileRoute("/api/models")({
  GET: async ({ request }) => {
    try {
      // Fetch from models.dev
      const response = await fetch(MODELS_API_URL, {
        headers: {
          "User-Agent": "FileConcat/1.0 (https://fileconcat.com)",
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: "Failed to fetch models",
            status: response.status,
          }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json",
            },
          },
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

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
  },
});
```

### 2. API Routes Klasoru Olusturma

```bash
mkdir -p apps/web/src/routes/api
```

### 3. Client-Side Fetch Hook

**Dosya:** `apps/web/src/hooks/use-models.ts` (yeni)

```typescript
import { useState, useEffect, useCallback } from "react";
import type { ModelsRegistry, FilteredModel } from "@fileconcat/core";

// Import static fallback data
import fallbackData from "~/data/models.json";

interface UseModelsReturn {
  /** All text-capable models */
  models: FilteredModel[];
  /** Full registry (if needed) */
  registry: ModelsRegistry | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Last update timestamp */
  lastUpdated: string | null;
  /** Manually refresh models from API */
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "fileconcat-models-cache";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

interface CachedModels {
  registry: ModelsRegistry;
  cachedAt: number;
}

function loadFromCache(): CachedModels | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed: CachedModels = JSON.parse(cached);
      // Check if cache is still valid
      if (Date.now() - parsed.cachedAt < CACHE_DURATION) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load models from cache:", e);
  }
  return null;
}

function saveToCache(registry: ModelsRegistry): void {
  try {
    const cacheData: CachedModels = {
      registry,
      cachedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
  } catch (e) {
    console.warn("Failed to save models to cache:", e);
  }
}

export function useModels(): UseModelsReturn {
  const [registry, setRegistry] = useState<ModelsRegistry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with fallback or cached data
  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setRegistry(cached.registry);
    } else {
      // Use static fallback data
      setRegistry(fallbackData as ModelsRegistry);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/models");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: ModelsRegistry = await response.json();
      setRegistry(data);
      saveToCache(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to refresh models";
      setError(message);
      console.error("Failed to refresh models:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    models: registry?.textModels ?? [],
    registry,
    isLoading,
    error,
    lastUpdated: registry?.lastUpdated ?? null,
    refresh,
  };
}
```

### 4. Data JSON Type Declaration

**Dosya:** `apps/web/src/data/models.json.d.ts` (yeni)

```typescript
import type { ModelsRegistry } from "@fileconcat/core";
declare const data: ModelsRegistry;
export default data;
```

## Test Etme

```bash
cd apps/web

# Dev server
pnpm dev

# API endpoint test
curl http://localhost:3000/api/models | head -100

# Response headers kontrol
curl -I http://localhost:3000/api/models
```

## Beklenen Response

```json
{
  "providers": { ... },
  "lastUpdated": "2024-01-23T10:30:00.000Z",
  "totalModels": 250,
  "textModels": [
    {
      "uid": "google/gemini-2.5-pro",
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "providerId": "google",
      "providerName": "Google",
      "contextLimit": 1048576,
      "outputLimit": 65536,
      "inputCost": 1.25,
      "outputCost": 10,
      "hasReasoning": true,
      "hasToolCall": true
    },
    ...
  ]
}
```

## Notlar

- Server function Cloudflare Workers'da calisacak
- Cache headers CDN caching icin optimize edilmis
- Client-side cache localStorage'da 1 saat
- Fallback data build-time'da olusturuluyor
- Error durumunda fallback data kullaniliyor

## Muhtemel Hatalar

1. **CORS**: Server function ayni origin, CORS gerekli degil
2. **Rate limit**: models.dev rate limit'e dikkat
3. **Timeout**: Cloudflare Workers 30s limit

## Rollback

```bash
rm apps/web/src/routes/api/models.ts
rm apps/web/src/hooks/use-models.ts
```
