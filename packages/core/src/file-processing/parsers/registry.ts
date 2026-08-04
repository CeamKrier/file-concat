import type { ExtractionResult, ParserId, ParserLoader, ParserRegistry } from "./types";

/**
 * Build a registry from a platform's loader map (ADR-0012).
 *
 * Declarative on purpose — there is no `register()` to call later. A late
 * registration would mean the answer to "can this build read a `.pdf`" depends
 * on which modules happen to have been imported when the first file lands, and
 * that is exactly the build-dependent classification ADR-0011 rules out.
 */
export function createParserRegistry(
  loaders: Readonly<Partial<Record<ParserId, ParserLoader>>>,
): ParserRegistry {
  return {
    has(id: ParserId): boolean {
      return loaders[id] !== undefined;
    },

    async extract(id: ParserId, bytes: Uint8Array): Promise<ExtractionResult> {
      const load = loaders[id];
      if (!load) return { text: "", notes: [{ kind: "parser-unavailable" }] };
      return load(bytes);
    },
  };
}
