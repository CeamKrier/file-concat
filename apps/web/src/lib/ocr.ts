import type { ExtractionResult } from "@fileconcat/core";

/**
 * Facade in front of the recognition path, same shape as `tokens.ts` and
 * `parsers.ts`: the `import.meta.env.SSR` guard is a literal at build time, so
 * the SSR build drops the branch below it and officeparser never reaches the
 * Cloudflare worker graph. A runtime `typeof window` check would not — see the
 * note in the root CLAUDE.md.
 */
export async function readWithOcr(
  bytes: Uint8Array,
  language: string,
): Promise<ExtractionResult> {
  if (import.meta.env.SSR) return { text: "" };
  const mod = await import("./extract-document-client");
  return mod.extractOfficeWithOcr(bytes, language);
}

/**
 * The same facade for the other rescue: named pages of a PDF, drawn and then
 * recognised, for a document whose fonts carry no character map. Same SSR guard
 * and same reason — this path pulls pdf.js and the recogniser in behind it.
 */
export async function readPdfPagesWithOcr(
  bytes: Uint8Array,
  pages: readonly number[],
  language: string,
  onPage?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  if (import.meta.env.SSR) return new Map();
  const mod = await import("./extract-document-client");
  return mod.readPdfPages(bytes, pages, language, onPage);
}
