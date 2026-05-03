import type { SourceAdapter, SourceRegistry, SourceType } from "./types";

/**
 * Create a source registry from adapters
 */
export function createSourceRegistry(adapters: SourceAdapter[]): SourceRegistry {
  return {
    adapters,

    getAdapter(url: string): SourceAdapter | undefined {
      return adapters.find((adapter) => adapter.matches(url));
    },

    getByType(type: SourceType): SourceAdapter | undefined {
      return adapters.find((adapter) => adapter.type === type);
    },

    detectType(url: string): SourceType | undefined {
      const adapter = this.getAdapter(url);
      return adapter?.type;
    },
  };
}
