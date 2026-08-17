import { matchesBinarySignature } from "./binary-signatures";

/** How a file's bytes read: legible text, unreadable binary, or the narrow
 * middle band we can't be sure about (decoded but partly-garbled). */
export type TextClassification = "text" | "binary" | "ambiguous";

export interface DecodedText {
  classification: TextClassification;
  /** Best-effort decoded text under {@link DecodedText.encoding}. */
  text: string;
  /** The encoding label the bytes were decoded with (e.g. "utf-8", "utf-16le"). */
  encoding: string;
}

/** Chars to sample when scoring how text-like a decode is. */
const SAMPLE_LIMIT = 8192;
/** Above this share of suspicious chars, the decode is not real text. */
const BINARY_RATIO = 0.3;
/** The narrow band below {@link BINARY_RATIO}: decoded but partly garbled. Kept
 * small so clean files (ratio ~0) never trip it and the flag stays meaningful. */
const AMBIGUOUS_RATIO = 0.05;

/**
 * Share of sampled chars that betray a non-text decode: the U+FFFD replacement
 * char (invalid byte sequence), NUL, and C0 control codes other than the
 * whitespace that legitimately appears in text (tab, LF, CR, form feed).
 */
function suspicionRatio(text: string): number {
  const limit = Math.min(text.length, SAMPLE_LIMIT);
  if (limit === 0) return 0;
  let suspicious = 0;
  for (let i = 0; i < limit; i++) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd || code === 0x00) {
      suspicious++;
    } else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d) {
      suspicious++;
    }
  }
  return suspicious / limit;
}

/**
 * Detect BOM-less UTF-16 by its tell: ASCII-dominant text encodes as a
 * printable byte paired with a NUL, so the NULs cluster on odd offsets (LE) or
 * even offsets (BE). Returns the encoding when one side clearly dominates, else
 * null (leaving the bytes to the UTF-8 path). This is what rescues the
 * Windows-exported source files a naive NUL sniff would drop as "binary".
 */
function detectBomlessUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const limit = Math.min(bytes.length, 1024);
  const pairs = Math.floor(limit / 2);
  if (pairs === 0) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x00) {
      if (i % 2 === 0) evenZeros++;
      else oddZeros++;
    }
  }
  if (oddZeros > pairs * 0.3 && oddZeros > evenZeros * 4) return "utf-16le";
  if (evenZeros > pairs * 0.3 && evenZeros > oddZeros * 4) return "utf-16be";
  return null;
}

/** Pick an encoding from BOM, then a BOM-less UTF-16 tell, else UTF-8. */
function decode(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" };
  }
  const bomless = detectBomlessUtf16(bytes);
  if (bomless) {
    return { text: new TextDecoder(bomless).decode(bytes), encoding: bomless };
  }
  return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
}

/**
 * Classify and decode a file's bytes in one pass. Content-based, not
 * extension-based: the same bytes drive both the include/exclude decision and
 * the text the bundle receives, so an odd encoding is decoded correctly instead
 * of being read as UTF-8 mojibake.
 */
export function classifyBytes(bytes: Uint8Array): DecodedText {
  // Media containers (images, video) can lead with a large text metadata header
  // — a C2PA/XMP block on AI-generated images — that a fixed-size content sniff
  // would read as legible text. Their signature is the ground truth. See ADR-0007.
  if (matchesBinarySignature(bytes) !== null) {
    return { classification: "binary", text: "", encoding: "binary" };
  }
  const { text, encoding } = decode(bytes);
  const ratio = suspicionRatio(text);
  if (ratio > BINARY_RATIO) {
    return { classification: "binary", text: "", encoding };
  }
  if (ratio > AMBIGUOUS_RATIO) {
    return { classification: "ambiguous", text, encoding };
  }
  return { classification: "text", text, encoding };
}

/** Read a File's bytes once, then classify and decode them via {@link classifyBytes}. */
export async function readFileAsText(file: File): Promise<DecodedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return classifyBytes(bytes);
}
