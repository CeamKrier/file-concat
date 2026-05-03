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
      // Use static fallback data (cast through unknown for JSON compatibility)
      setRegistry(fallbackData as unknown as ModelsRegistry);
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
