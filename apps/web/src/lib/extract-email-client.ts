import PostalMime from "postal-mime";
import { formatEmail, type ExtractionResult } from "@fileconcat/core";

/**
 * Client-only message parsing. Reached solely through the guarded dynamic
 * import in ./parsers, which is what keeps `postal-mime` out of the Cloudflare
 * SSR worker bundle — Vite inlines dynamic imports in the SSR build, so the
 * `import.meta.env.SSR` guard next door is the part that does the work.
 *
 * The library runs perfectly well on a worker; the reason to keep it out is
 * size. Nothing on the server ever parses a message.
 */
export async function extractEmail(bytes: Uint8Array): Promise<ExtractionResult> {
  return formatEmail(await PostalMime.parse(bytes));
}
