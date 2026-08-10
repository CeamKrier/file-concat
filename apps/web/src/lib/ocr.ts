import type { ExtractionResult } from "@fileconcat/core";

/**
 * Facade in front of the recognition path, same shape as `tokens.ts` and
 * `parsers.ts`: the `import.meta.env.SSR` guard is a literal at build time, so
 * the SSR build drops the branch below it and officeparser never reaches the
 * Cloudflare worker graph. A runtime `typeof window` check would not — see the
 * note in the root CLAUDE.md.
 */
export async function readWithOcr(bytes: Uint8Array): Promise<ExtractionResult> {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-document-client");
  return mod.extractOfficeWithOcr(bytes);
}
