/**
 * Magic-number signatures for binary media containers.
 *
 * The content classifier ({@link ./text-classification}) sniffs a fixed leading
 * sample and lets the decoded bytes decide text-vs-binary. That is robust for
 * most files, but it has a blind spot: a binary container can carry a large
 * *text* header, so the sniff window reads as legible text and the file slips
 * through as "text". The real-world trigger is AI-generated PNG/JPEG images
 * (ChatGPT, DALL-E, phone cameras): they prepend a multi-KB C2PA "Content
 * Credentials" (caBX / JUMBF) or XMP block before the compressed image data,
 * pushing the high-entropy bytes past the sniff window entirely.
 *
 * A signature check closes that blind spot without reintroducing extension
 * trust: it reads the file's own leading bytes, so it catches renamed and
 * extensionless files too. Every signature here begins with a byte no plain
 * text file starts with (a high or control byte) or is long enough that a false
 * positive on prose is not credible. See ADR-0007.
 */

/** A container magic number: match `bytes` at `offset` against `magic`. */
interface Signature {
  offset: number;
  magic: readonly number[];
  /** What the bytes turned out to be. Named by content, so a renamed `.dat`
   * reports `png` like any other PNG. */
  format: string;
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/**
 * Media-container signatures. Kept to raster images, the ISO base-media
 * family (heic/avif/mp4/mov) and Matroska plus Photoshop — the binaries whose leading
 * metadata most plausibly masquerades as text. Formats with unambiguous
 * high-entropy headers are already caught by the suspicion classifier.
 */
const SIGNATURES: readonly Signature[] = [
  { offset: 0, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], format: "png" },
  { offset: 0, magic: [0xff, 0xd8, 0xff], format: "jpeg" }, // JFIF/EXIF/XMP variants
  { offset: 0, magic: [...ascii("GIF87a")], format: "gif" },
  { offset: 0, magic: [...ascii("GIF89a")], format: "gif" },
  { offset: 0, magic: [0x49, 0x49, 0x2a, 0x00], format: "tiff" }, // little-endian
  { offset: 0, magic: [0x4d, 0x4d, 0x00, 0x2a], format: "tiff" }, // big-endian
  { offset: 0, magic: [0x00, 0x00, 0x01, 0x00], format: "ico" },
  { offset: 0, magic: [0x00, 0x00, 0x02, 0x00], format: "cur" },
  { offset: 0, magic: [...ascii("8BPS")], format: "psd" },
  // heic, avif, mp4, m4a and mov share this one; the brand after it splits
  // the photos off as `heif` (see below). Neither is recognisable (ADR-0017).
  { offset: 4, magic: [...ascii("ftyp")], format: "iso-bmff" },
  // The EBML header Matroska and WebM both open with. Named so a video's own
  // subtitle track can be read; before, the byte classifier called it binary.
  { offset: 0, magic: [0x1a, 0x45, 0xdf, 0xa3], format: "matroska" },
  // Audio, named so speech in it can be offered for transcription. Each ASCII
  // tag is held to the control byte that follows it in a real file: an ID3v2
  // version and zero revision, FLAC's first metadata block type, Ogg's version.
  { offset: 0, magic: [...ascii("ID3"), 0x02, 0x00], format: "mp3" },
  { offset: 0, magic: [...ascii("ID3"), 0x03, 0x00], format: "mp3" },
  { offset: 0, magic: [...ascii("ID3"), 0x04, 0x00], format: "mp3" },
  // An untagged MP3 opens on a Layer III frame sync. Only those four, because
  // the sync's other values include FF FE, the UTF-16 byte-order mark.
  { offset: 0, magic: [0xff, 0xfb], format: "mp3" },
  { offset: 0, magic: [0xff, 0xfa], format: "mp3" },
  { offset: 0, magic: [0xff, 0xf3], format: "mp3" },
  { offset: 0, magic: [0xff, 0xf2], format: "mp3" },
  { offset: 0, magic: [0xff, 0xf1], format: "aac" }, // ADTS, MPEG-4
  { offset: 0, magic: [0xff, 0xf9], format: "aac" }, // ADTS, MPEG-2
  { offset: 0, magic: [...ascii("fLaC"), 0x00], format: "flac" },
  { offset: 0, magic: [...ascii("fLaC"), 0x80], format: "flac" },
  { offset: 0, magic: [...ascii("OggS"), 0x00], format: "ogg" },
];

/**
 * Major brands of a HEIF still image (ISO/IEC 23008-12, and AVIF's), so a phone
 * photo is never offered for transcription as if it were a video.
 */
const HEIF_BRANDS: ReadonlySet<string> = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif", "avis"]);

/** RIFF containers ("RIFF" + 4-byte size + a form tag) that are binary media. */
const RIFF = ascii("RIFF");
const RIFF_FORMS: readonly { tag: readonly number[]; format: string }[] = [
  { tag: ascii("WEBP"), format: "webp" },
  { tag: ascii("WAVE"), format: "wave" },
  { tag: ascii("AVI "), format: "avi" },
];

/**
 * The raster formats the browser decodes and tesseract accepts directly, so
 * recognition can be offered over them (ADR-0017). Everything else the table
 * matches stays a plain binary: a favicon has no writing to find, `psd` never
 * reaches a canvas, and the `ftyp` family is mostly video.
 */
export const RECOGNISABLE_IMAGE_FORMATS: ReadonlySet<string> = new Set([
  "png",
  "jpeg",
  "gif",
  "tiff",
  "webp",
]);

function matchesAt(bytes: Uint8Array, offset: number, magic: readonly number[]): boolean {
  if (offset + magic.length > bytes.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/**
 * The binary media container `bytes` begins with, or null when none matches.
 * Operates on content, not filename, so it survives renames and missing
 * extensions. Requiring a RIFF form tag keeps ordinary words like "RIFF" or
 * "GIFT" from tripping the check.
 */
export function matchesBinarySignature(bytes: Uint8Array): string | null {
  for (const { offset, magic, format } of SIGNATURES) {
    if (!matchesAt(bytes, offset, magic)) continue;
    if (format === "iso-bmff" && HEIF_BRANDS.has(String.fromCharCode(...bytes.subarray(8, 12)))) return "heif";
    return format;
  }
  if (matchesAt(bytes, 0, RIFF)) {
    return RIFF_FORMS.find(({ tag }) => matchesAt(bytes, 8, tag))?.format ?? null;
  }
  return null;
}
