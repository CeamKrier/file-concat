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
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/**
 * Media-container signatures. Kept to raster images and the ISO base-media
 * family (heic/avif/mp4/mov) plus Photoshop — the binaries whose leading
 * metadata most plausibly masquerades as text. Formats with unambiguous
 * high-entropy headers are already caught by the suspicion classifier.
 */
const SIGNATURES: readonly Signature[] = [
  { offset: 0, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG
  { offset: 0, magic: [0xff, 0xd8, 0xff] }, // JPEG (JFIF/EXIF/XMP variants)
  { offset: 0, magic: [...ascii("GIF87a")] }, // GIF
  { offset: 0, magic: [...ascii("GIF89a")] }, // GIF
  { offset: 0, magic: [0x49, 0x49, 0x2a, 0x00] }, // TIFF little-endian
  { offset: 0, magic: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF big-endian
  { offset: 0, magic: [0x00, 0x00, 0x01, 0x00] }, // ICO
  { offset: 0, magic: [0x00, 0x00, 0x02, 0x00] }, // CUR
  { offset: 0, magic: [...ascii("8BPS")] }, // Photoshop PSD
  { offset: 4, magic: [...ascii("ftyp")] }, // ISO base media: heic, avif, mp4, mov
];

/** RIFF containers ("RIFF" + 4-byte size + a form tag) that are binary media. */
const RIFF = ascii("RIFF");
const RIFF_FORMS = [ascii("WEBP"), ascii("WAVE"), ascii("AVI ")];

function matchesAt(bytes: Uint8Array, offset: number, magic: readonly number[]): boolean {
  if (offset + magic.length > bytes.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/**
 * True when `bytes` begins with a known binary media-container signature.
 * Operates on content, not filename, so it survives renames and missing
 * extensions. Requiring a RIFF form tag keeps ordinary words like "RIFF" or
 * "GIFT" from tripping the check.
 */
export function matchesBinarySignature(bytes: Uint8Array): boolean {
  for (const { offset, magic } of SIGNATURES) {
    if (matchesAt(bytes, offset, magic)) return true;
  }
  if (matchesAt(bytes, 0, RIFF)) {
    return RIFF_FORMS.some((form) => matchesAt(bytes, 8, form));
  }
  return false;
}
