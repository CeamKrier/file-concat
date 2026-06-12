import type { SourceAdapter, SourceRegistry, SourceType } from "./types";

const isFallback = (adapter: SourceAdapter): boolean => adapter.priority === "fallback";

/**
 * Create a source registry. Specific adapters are consulted before fallback
 * adapters regardless of insertion order, so the fallback semantic does not
 * depend on the order of the `adapters` array.
 */
export function createSourceRegistry(adapters: SourceAdapter[]): SourceRegistry {
  const specific = adapters.filter((a) => !isFallback(a));
  const fallback = adapters.filter(isFallback);

  return {
    adapters,

    getAdapter(url: string): SourceAdapter | undefined {
      return specific.find((a) => a.matches(url)) ?? fallback.find((a) => a.matches(url));
    },

    getByType(type: SourceType): SourceAdapter | undefined {
      return adapters.find((a) => a.type === type);
    },

    detectType(url: string): SourceType | undefined {
      return this.getAdapter(url)?.type;
    },
  };
}
