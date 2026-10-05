import { isPasswordProtected } from "./officeparser";
import type { ExtractionResult, ParserLoader } from "./types";

/**
 * Detected format -> the readers tried after the platform's own one, in order.
 * Data, not code: a new benchmark result changes a line here and nothing else
 * (extraction router, step R1).
 *
 * Only formats the fallback was measured on are listed (POI test-data and the
 * converted legacy corpus, 2026-10-03 and 2026-10-05). anydoc is the only
 * browser reader for a 97-2003 `.ppt`, which reaches it through `cfb`: the
 * compound-file reader answers `parser-unavailable` for a deck, and anydoc read
 * 105 of 145 POI decks that today produce nothing.
 */
export const FALLBACK_READERS: Readonly<Record<string, readonly string[]>> = {
  docx: ["anydoc"],
  pptx: ["anydoc"],
  xlsx: ["anydoc"],
  xlsm: ["anydoc"],
  rtf: ["anydoc"],
  cfb: ["anydoc"],
};

/**
 * Share of characters nobody can read: U+FFFD, C0 controls other than tab and
 * line breaks, and the private-use area. The definition the extraction eval's
 * robustness summary used, so the eval and the product measure one thing.
 */
export function garbageShare(text: string): number {
  if (!text) return 0;
  let bad = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (
      code === 0xfffd ||
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0xe000 && code <= 0xf8ff) ||
      code >= 0xf0000
    ) {
      bad += 1;
    }
  }
  return bad / text.length;
}

// ponytail: a guess. Every product reader measured 0.00% on POI and anydoc 0.04%
// on ppt, so nothing real sits near it; move it once `extract_reader` shows a
// fallback winning on garbage.
const GARBAGE_LIMIT = 0.05;

/** Text a person could use: something beyond whitespace, and not mostly garbage. */
export function isUsable(result: ExtractionResult): boolean {
  return /\S/.test(result.text) && garbageShare(result.text) <= GARBAGE_LIMIT;
}

/**
 * Run `primary`, then each named fallback while the answer is not usable (a
 * throw, empty text, `parser-unavailable`, garbage). The first usable answer
 * wins and carries its reader id; when none is usable the primary's own outcome
 * stands, thrown error included, so a file nothing can read fails exactly as it
 * did before any fallback existed.
 *
 * A locked document stops the chain: no reader opens it without the password,
 * and trying would download every fallback for nothing.
 */
export async function extractWithFallback(
  primary: { id: string; read: ParserLoader },
  fallbacks: Readonly<Record<string, ParserLoader>>,
  bytes: Uint8Array,
  format?: string,
): Promise<ExtractionResult> {
  let first: { result: ExtractionResult } | { error: unknown };
  try {
    const result = await primary.read(bytes, format);
    if (isUsable(result)) return { ...result, reader: primary.id };
    first = { result };
  } catch (error) {
    if (isPasswordProtected(error)) throw error;
    first = { error };
  }
  for (const id of FALLBACK_READERS[format ?? ""] ?? []) {
    const read = fallbacks[id];
    if (!read) continue;
    try {
      const result = await read(bytes, format);
      if (isUsable(result)) return { ...result, reader: id };
    } catch {
      // A fallback failing is the ordinary case for a file nothing reads.
    }
  }
  if ("error" in first) throw first.error;
  return first.result;
}
