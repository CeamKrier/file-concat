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

/** What a reading of an image has to clear to count as one. Both numbers are
 * guesses; `ocr_conf` is the measurement that will replace them (ADR-0017). */
export const MIN_CONFIDENCE = 55;
export const MIN_ALNUM = 8;

/**
 * Whether a reading counts.
 *
 * `if (text)` is honest for a scan, which either reads or does not, and
 * dishonest for a photograph: tesseract answers every picture, and a logo or a
 * patch of carpet comes back as a few characters of confident-looking junk.
 * Below either floor the file is left exactly as it was, still binary.
 */
export function clearsRecognitionFloor(reading: {
  text: string;
  confidence: number;
}): boolean {
  if (reading.confidence < MIN_CONFIDENCE) return false;
  return (reading.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= MIN_ALNUM;
}

/**
 * The same facade for an image, which unlike a document is never read unless
 * the person asked for it (ADR-0017). Applies the floor here so there is one
 * answer to "did that count", and still reports the confidence, which is what
 * `ocr_conf` records whether the reading was kept or not.
 */
export async function recogniseImageWithOcr(
  file: File,
  language: string,
): Promise<{ text: string; confidence: number }> {
  if (import.meta.env.SSR) return { text: "", confidence: 0 };
  const mod = await import("./extract-document-client");
  const reading = await mod.recogniseImage(file, language);
  return clearsRecognitionFloor(reading) ? reading : { ...reading, text: "" };
}
