import { unzipSync } from "fflate";

import { zipDirectory } from "./archives";

/**
 * Whether a container's own bytes say it is encrypted, so the person is told
 * to remove the password instead of being shown a damaged or binary file.
 *
 * - Zip: any entry with general purpose bit 0 set (APPNOTE 4.4.4), which
 *   ZipCrypto and WinZip AES both set. Tika's ZipParser asks the same bit.
 * - EPUB: `META-INF/encryption.xml` naming a method other than font
 *   obfuscation, the test calibre's EPUB input makes before refusing a book
 *   as DRM-protected (Adobe ADEPT, Readium LCP).
 * - OLE2 compound file: an `EncryptedPackage` stream beside `EncryptionInfo`
 *   (a password-protected .docx, .xlsx or .pptx), or the `DRMEncryptedDataSpace`
 *   of rights-managed Office, the names Tika's POIFSContainerDetector checks.
 *   The directory is found by searching for the UTF-16 names rather than by
 *   walking the sectors; nothing else in such a file spells them.
 *
 * A PDF is left to its reader: one with only an owner password opens and reads
 * normally, and one with a user password already fails as "Password protected".
 */
export function isEncryptedContainer(bytes: Uint8Array): boolean {
  if (startsWith(bytes, ZIP)) return encryptedZip(bytes);
  if (startsWith(bytes, CFB)) {
    return (contains(bytes, utf16("EncryptedPackage")) && contains(bytes, utf16("EncryptionInfo"))) ||
      contains(bytes, utf16("DRMEncryptedDataSpace"));
  }
  return false;
}

/**
 * The paths, relative to the book's root, that an EPUB's `encryption.xml`
 * encrypts with something other than font obfuscation. Also serves a book
 * dropped unpacked, whose encrypted chapters otherwise read as binary noise.
 */
export function epubEncryptedPaths(xml: string): string[] {
  const paths: string[] = [];
  // Read with indexOf rather than one regex over the whole file: lazy and
  // negated-class patterns there backtrack quadratically, and a hostile 1 MiB
  // manifest froze the tab for 8-23 s.
  for (const block of xml.split(/<\/(?:\w+:)?EncryptedData\s*>/)) {
    if (!block.includes("EncryptedData")) continue;
    const algorithm = attribute(block, "EncryptionMethod", "Algorithm");
    const uri = attribute(block, "CipherReference", "URI");
    if (algorithm !== undefined && !FONT_OBFUSCATION.has(algorithm) && uri) paths.push(decodeUri(uri));
  }
  return paths;
}

/** One attribute of the last `tag` in `block`, read within that tag. */
function attribute(block: string, tag: string, name: string): string | undefined {
  const at = block.lastIndexOf(tag);
  if (at < 0) return undefined;
  const end = block.indexOf(">", at);
  const open = block.slice(at, end < 0 ? undefined : end);
  const key = new RegExp(`\\b${name}\\s*=\\s*(["'])`).exec(open);
  if (!key) return undefined;
  const from = key.index + key[0].length;
  const close = open.indexOf(key[1], from);
  return close < 0 ? undefined : open.slice(from, close);
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENCRYPTION_XML = "META-INF/encryption.xml";
const FONT_OBFUSCATION = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);

function encryptedZip(bytes: Uint8Array): boolean {
  let records = 0;
  let hasEncryptionXml = false;
  for (const { flags, name } of zipDirectory(bytes)) {
    records++;
    if (flags & 1) return true;
    if (!hasEncryptionXml && String.fromCharCode(...name) === ENCRYPTION_XML) hasEncryptionXml = true;
  }
  // No directory to read (truncated, zip64): the first local header's flags.
  if (records === 0) return bytes.length >= 8 && (bytes[6] & 1) === 1;
  if (!hasEncryptionXml) return false;
  try {
    // ponytail: sizes are the archive's own claims, so this bounds the work, not
    // the inflate; whole-archive expansion beside it is uncapped anyway.
    const small = (f: { name: string; size: number; originalSize: number }) =>
      f.name === ENCRYPTION_XML && f.size <= 1 << 20 && f.originalSize <= 1 << 20;
    const part = unzipSync(bytes, { filter: small })[ENCRYPTION_XML];
    return part !== undefined && epubEncryptedPaths(new TextDecoder().decode(part)).length > 0;
  } catch {
    return false;
  }
}

function decodeUri(uri: string): string {
  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte);
}

function utf16(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text).flatMap((ch) => [ch.charCodeAt(0), 0]));
}

function contains(bytes: Uint8Array, needle: Uint8Array): boolean {
  const first = needle[0];
  for (let at = bytes.indexOf(first); at !== -1 && at + needle.length <= bytes.length; at = bytes.indexOf(first, at + 1)) {
    let i = 1;
    while (i < needle.length && bytes[at + i] === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}
