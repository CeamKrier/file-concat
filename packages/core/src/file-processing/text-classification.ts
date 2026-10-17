import { matchesBinarySignature } from "./binary-signatures";
import type { EncodingGuesser } from "./encoding-guess";

/**
 * How a file's bytes read: text, binary, or text whose encoding is a guess
 * (`ambiguous`: kept in the bundle, flagged so the person can pick another).
 */
export type TextClassification = "text" | "binary" | "ambiguous";

export interface DecodedText {
  classification: TextClassification;
  /** The decoded text under {@link DecodedText.encoding}; empty for binary. */
  text: string;
  /** The encoding the bytes were decoded with, as `TextDecoder` names it ("utf-8", "windows-1251"). */
  encoding: string;
  /**
   * Set when nothing in the bytes said which encoding they are: `guess` when a
   * guesser (or a mostly-UTF-8 reading) named it, `fallback` when windows-1252
   * was used because there was no guesser to ask.
   */
  guessed?: "guess" | "fallback";
  /** Share of the first window that is control bytes no text holds (0-1). Set on a binary verdict. */
  controlShare?: number;
  /** Bytes read as text before binary data started; set only when the rest was cut off. */
  stoppedAt?: number;
}

/** Bytes of content (padding aside) the text/binary verdict is taken on. */
const FIRST_WINDOW = 8192;
/** Content read past a binary-looking first window before the verdict stands. */
const CONFIRM_WINDOW = 65536;
/** Tika's line: above this share of unsafe control bytes the bytes are not text. */
const CONTROL_LIMIT = 0.02;
/** A run of NULs at least this long is padding (a preallocated log, a sparse file), not content. */
const PADDING_RUN = 16;
/** Block the rest of a text file is scanned in for the start of binary data. */
const TAIL_BLOCK = 4096;
/** Window that decides whether a control byte starts binary data or is a stray one in text. */
const RUN_WINDOW = 256;
/** How much of the file the guesser and the declared-charset scan look at. */
const GUESS_BYTES = 65536;
const DECLARED_BYTES = 1024;

/**
 * Control bytes no text file holds, as libmagic's `text_chars` and Tika's
 * `IS_CONTROL_BYTE` define them: C0 except BEL, BS, HT, LF, VT, FF, CR, SUB
 * and ESC (ANSI colours), plus DEL. They mean the same in every
 * ASCII-compatible encoding, which is why they decide text from binary and an
 * undecodable byte does not.
 */
const UNSAFE = new Uint8Array(256);
for (let c = 0; c < 0x20; c++) UNSAFE[c] = 1;
for (const c of [0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1a, 0x1b]) UNSAFE[c] = 0;
UNSAFE[0x7f] = 1;

interface Scan {
  /** Unsafe control bytes counted. */
  bad: number;
  /** Bytes counted, padding runs aside. */
  counted: number;
  /** Where the scan stopped. */
  end: number;
  /** Where the first unsafe byte sits, or -1. */
  firstBad: number;
}

/** Scan from `start` until `want` bytes of content have been counted, setting NUL padding runs aside. */
function scan(bytes: Uint8Array, start: number, want: number): Scan {
  let bad = 0;
  let counted = 0;
  let firstBad = -1;
  let i = start;
  for (; i < bytes.length && counted < want; i++) {
    if (bytes[i] === 0) {
      let j = i;
      while (j < bytes.length && bytes[j] === 0) j++;
      if (j - i >= PADDING_RUN) {
        i = j - 1;
        continue;
      }
    }
    counted++;
    if (UNSAFE[bytes[i]]) {
      bad++;
      if (firstBad < 0) firstBad = i;
    }
  }
  return { bad, counted, end: i, firstBad };
}

const share = (s: Scan) => (s.counted ? s.bad / s.counted : 0);

/**
 * The file's Unicode form when its bytes say so: a byte order mark (UTF-32
 * before UTF-16, since a UTF-32LE mark starts with the UTF-16LE one), or NULs
 * on fixed lanes, the mark of UTF-16 and UTF-32 text without one. A sample that
 * is nearly all NULs is padding, not a form.
 */
function unicodeForm(b: Uint8Array): { encoding: string; skip: number } | null {
  if (b[0] === 0xff && b[1] === 0xfe && b[2] === 0 && b[3] === 0) return { encoding: "utf-32le", skip: 4 };
  if (b[0] === 0 && b[1] === 0 && b[2] === 0xfe && b[3] === 0xff) return { encoding: "utf-32be", skip: 4 };
  if (b[0] === 0xff && b[1] === 0xfe) return { encoding: "utf-16le", skip: 2 };
  if (b[0] === 0xfe && b[1] === 0xff) return { encoding: "utf-16be", skip: 2 };
  const n = Math.min(b.length, 1024) & ~3;
  const quarter = n / 4;
  if (quarter < 4) return null;
  const lane = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) if (b[i] === 0) lane[i % 4]++;
  if (lane[0] + lane[1] + lane[2] + lane[3] > n * 0.9) return null;
  if (lane[1] > quarter * 0.9 && lane[2] > quarter * 0.9 && lane[3] > quarter * 0.9) return { encoding: "utf-32le", skip: 0 };
  if (lane[0] > quarter * 0.9 && lane[1] > quarter * 0.9 && lane[2] > quarter * 0.9) return { encoding: "utf-32be", skip: 0 };
  const odd = lane[1] + lane[3];
  const even = lane[0] + lane[2];
  if (odd > quarter * 0.6 && odd > even * 4) return { encoding: "utf-16le", skip: 0 };
  if (even > quarter * 0.6 && even > odd * 4) return { encoding: "utf-16be", skip: 0 };
  return null;
}

/** `TextDecoder` has no UTF-32, so it is read by hand. A code point out of range becomes U+FFFD. */
function decodeUtf32(bytes: Uint8Array, littleEndian: boolean): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: string[] = [];
  let chunk: number[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    const cp = view.getUint32(i, littleEndian);
    chunk.push(cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? cp : 0xfffd);
    if (chunk.length === 8192) {
      parts.push(String.fromCodePoint(...chunk));
      chunk = [];
    }
  }
  parts.push(String.fromCodePoint(...chunk));
  return parts.join("");
}

/**
 * The bytes without NULs: padding runs and stray ones alike, since a NUL in an
 * ASCII-compatible encoding is never a character anyone wants in a bundle. The
 * same array when there is none.
 */
function stripNuls(bytes: Uint8Array): Uint8Array {
  return bytes.includes(0) ? bytes.filter((b) => b !== 0) : bytes;
}

/** Valid UTF-8, allowing a sequence the end of a sample cut in two. */
function isUtf8(bytes: Uint8Array): boolean {
  let end = bytes.length;
  for (let k = 1; k <= 3 && end - k >= 0; k++) {
    if ((bytes[end - k] & 0xc0) === 0xc0) {
      end -= k;
      break;
    }
    if ((bytes[end - k] & 0xc0) !== 0x80) break;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

/** A label `TextDecoder` accepts, in its own spelling, or null. */
function canonical(label: string): string | null {
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return null;
  }
}

/**
 * The charset the file names for itself: an XML declaration, an HTML meta
 * charset, a CSS `@charset`, or a Python/Emacs coding cookie on its first two
 * lines. Read from the first kilobyte only.
 */
function declaredCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, DECLARED_BYTES));
  const match =
    /<\?xml[^>]{0,200}?encoding=["']([\w.:-]{1,40})["']/i.exec(head) ??
    /<meta[^>]{0,200}?charset=["']?([\w.:-]{1,40})/i.exec(head) ??
    /@charset\s{0,4}"([\w.:-]{1,40})"/i.exec(head) ??
    /coding[:=]\s{0,4}([\w.-]{1,40})/.exec(head.split("\n", 2).join("\n"));
  const label = match ? canonical(match[1]) : null;
  // A file that says UTF-8 or UTF-16 and is neither has said nothing usable.
  return label && !label.startsWith("utf-") ? label : null;
}

/**
 * UTF-8 with a few stray bytes (one Latin-1 character in a UTF-8 file): far
 * more valid multi-byte characters than broken ones. A legacy encoding read as
 * UTF-8 is the other way round.
 */
function mostlyUtf8(text: string): boolean {
  let broken = 0;
  let wide = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd) broken++;
    else if (c >= 0x80) wide++;
  }
  return wide > 0 && wide >= broken * 4;
}

/**
 * Classify and decode a file's bytes: the whole file, or a leading sample
 * when only the verdict is needed. Content decides, never the name.
 *
 * 1. A media signature is binary, whatever text its metadata header holds.
 * 2. A Unicode form the bytes announce (mark or NUL lanes) is text in it.
 * 3. Control bytes decide text from binary: over 2% of the first 8 KB of
 *    content, confirmed on the next 64 KB when there is more, is binary.
 *    Runs of NULs are padding and do not count. An undecodable byte is never
 *    evidence of binary: a legacy encoding is full of them.
 * 4. Text then stops where binary data starts (over 2% of a 4 KB block),
 *    and NULs are dropped.
 * 5. The encoding: strict UTF-8, the charset the file declares, mostly
 *    UTF-8, then the guesser; windows-1252 when there is none. A guessed
 *    encoding is `ambiguous`, never a reason to drop the file.
 */
export function classifyBytes(bytes: Uint8Array, guess?: EncodingGuesser): DecodedText {
  // Media containers can lead with a large text metadata header (a C2PA/XMP
  // block on AI-generated images) that a content sniff would read as legible
  // text. Their signature is the ground truth. See ADR-0007.
  if (matchesBinarySignature(bytes) !== null) {
    return { classification: "binary", text: "", encoding: "binary" };
  }

  const form = unicodeForm(bytes);
  if (form) {
    const body = bytes.subarray(form.skip);
    const text = form.encoding.startsWith("utf-32")
      ? decodeUtf32(body, form.encoding === "utf-32le")
      : new TextDecoder(form.encoding).decode(body);
    return { classification: "text", text, encoding: form.encoding };
  }

  const head = scan(bytes, 0, FIRST_WINDOW);
  const binaryHead = share(head) > CONTROL_LIMIT;
  if (binaryHead) {
    // The verdict is taken on head and rest together, as on one larger
    // sample. Judging the rest alone let a clean rest outvote a head of solid
    // binary: an ELF library whose string tables follow its headers, a pickle
    // that ends in names, both read as text (probe, 2026-10-17).
    const rest = scan(bytes, head.end, CONFIRM_WINDOW);
    if (rest.counted === 0 || (head.bad + rest.bad) / (head.counted + rest.counted) > CONTROL_LIMIT) {
      return { classification: "binary", text: "", encoding: "binary", controlShare: share(head) };
    }
  }

  // A head the next window outvoted is kept as it is; otherwise the search for
  // where binary data starts begins at the first byte, since it can start
  // inside the head without tipping the head's own share.
  let stoppedAt: number | undefined;
  for (let at = binaryHead ? head.end : 0, previous = at; at < bytes.length; ) {
    const block = scan(bytes, at, TAIL_BLOCK);
    if (share(block) > CONTROL_LIMIT) {
      stoppedAt = binaryStart(bytes, previous, block.firstBad);
      break;
    }
    previous = at;
    at = block.end;
  }
  // Binary data from inside the first run window leaves a format's own header
  // (a pickle's protocol bytes), not text worth an entry: one stray character
  // under a note, where the whole file is better named as binary.
  if (stoppedAt !== undefined && stoppedAt < RUN_WINDOW) {
    return { classification: "binary", text: "", encoding: "binary" };
  }
  const kept = stripNuls(stoppedAt === undefined ? bytes : bytes.subarray(0, stoppedAt));
  const cut = stoppedAt === undefined ? {} : { stoppedAt };

  if (isUtf8(kept)) {
    return { classification: "text", text: new TextDecoder("utf-8").decode(kept), encoding: "utf-8", ...cut };
  }
  const declared = declaredCharset(kept);
  if (declared) {
    return { classification: "text", text: new TextDecoder(declared).decode(kept), encoding: declared, ...cut };
  }
  const asUtf8 = new TextDecoder("utf-8").decode(kept);
  if (mostlyUtf8(asUtf8)) {
    return { classification: "ambiguous", text: asUtf8, encoding: "utf-8", guessed: "guess", ...cut };
  }
  const named = guess ? canonical(safeGuess(guess, kept.subarray(0, GUESS_BYTES))) : null;
  const encoding = named ?? "windows-1252";
  return {
    classification: "ambiguous",
    text: new TextDecoder(encoding).decode(kept),
    encoding,
    guessed: named ? "guess" : "fallback",
    ...cut,
  };
}

/**
 * Where binary data starts, looked for from the block before the first one
 * over the limit (it can start late in a block without tipping it): the first
 * control byte with as dense a run after it, then back to the end of the line
 * before it, so binary that happened to look printable stays out.
 */
function binaryStart(bytes: Uint8Array, from: number, firstBad: number): number {
  let start = firstBad;
  for (let i = from; i < firstBad; i++) {
    if (UNSAFE[bytes[i]] && share(scan(bytes, i, RUN_WINDOW)) > CONTROL_LIMIT) {
      start = i;
      break;
    }
  }
  const lineEnd = bytes.lastIndexOf(0x0a, start);
  return lineEnd >= from ? lineEnd + 1 : start;
}

/** A guesser that throws has not guessed. */
function safeGuess(guess: EncodingGuesser, bytes: Uint8Array): string {
  try {
    return guess(bytes);
  } catch {
    return "";
  }
}

/**
 * Decode bytes in an encoding the person picked after a guess read them
 * wrong. The same cut and NUL rules apply, so the text differs from the
 * guessed one only in its letters. Null for a label `TextDecoder` does not
 * know, and for UTF-16, which the bytes would have announced on their own.
 */
export function decodeAs(bytes: Uint8Array, label: string): string | null {
  const encoding = canonical(label);
  if (!encoding || encoding.startsWith("utf-16")) return null;
  const end = classifyBytes(bytes).stoppedAt ?? bytes.length;
  return new TextDecoder(encoding).decode(stripNuls(bytes.subarray(0, end)));
}

/** Read a File's bytes once, then classify and decode them via {@link classifyBytes}. */
export async function readFileAsText(file: File, guess?: EncodingGuesser): Promise<DecodedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return classifyBytes(bytes, guess);
}
