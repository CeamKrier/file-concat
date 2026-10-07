import { gunzipSync, unzipSync } from "fflate";

/**
 * Archive expansion. An **Archive** yields *files*, where an Extractable
 * document yields *text* (CONTEXT.md) — which is why the router treats them as
 * two separate outcomes even though `.docx` and `.zip` share a signature.
 *
 * This lives in core rather than in the web app because nothing here is
 * browser-specific: it is bytes in, `[path, bytes]` out. The CLI could not open
 * a single archive before it moved here.
 */

/** Archive containers the router recognizes. Not all of them can be opened. */
export type ArchiveKind = "zip" | "tar" | "gz" | "bz2" | "xz" | "rar" | "7z";

/** One file recovered from an archive. `path` is relative to the archive root. */
export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

/**
 * What core unpacks itself, with fflate. The rest (`bz2`, `xz`, `rar`, `7z`)
 * needs a wasm reader, which is a platform's to load (the web ships 7-Zip); a
 * platform without one reports them as unsupported instead of mistaking them
 * for opaque binaries.
 */
const EXPANDABLE: ReadonlySet<ArchiveKind> = new Set<ArchiveKind>(["zip", "tar", "gz"]);

export function canExpandArchive(kind: ArchiveKind): boolean {
  return EXPANDABLE.has(kind);
}

/** Editor backups and OS metadata that no bundle ever wants. */
function isCruft(name: string): boolean {
  return name.includes("__MACOSX/") || name.endsWith(".DS_Store");
}

/**
 * The archive's name with its container suffix removed, used as the folder the
 * entries land under. `.tar.gz` is stripped whole so `logs.tar.gz` yields
 * `logs/`, not `logs.tar/`.
 */
export function stripArchiveSuffix(name: string): string {
  return name.replace(/\.(tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz|zip|tar|gz|bz2|xz|rar|7z)$/i, "");
}

/**
 * A tar header carries a checksum of its own 512 bytes, computed with the
 * checksum field itself read as eight spaces. Validating it identifies a tar
 * from content alone — including the pre-POSIX v7 variant that carries no
 * `ustar` magic and that a magic-number check therefore misses.
 */
export function isTarHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;

  let declared = 0;
  let sawDigit = false;
  for (let i = 148; i < 156; i++) {
    const c = bytes[i];
    if (c >= 0x30 && c <= 0x37) {
      declared = declared * 8 + (c - 0x30);
      sawDigit = true;
    } else if (sawDigit) {
      break; // trailing NUL / space terminator
    }
  }
  if (!sawDigit) return false;

  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += i >= 148 && i < 156 ? 0x20 : bytes[i];
  }
  return sum === declared;
}

/**
 * Minimal ustar / GNU / pax tar reader. Returns regular files only, empty ones
 * included; directories and links are skipped. GNU long names (`L`) and pax
 * `path` records (`x`) name the next entry, which is how a path past 100 bytes
 * or outside ASCII is stored; global pax headers (`g`) are skipped. Base-256
 * large sizes are not read (rare, and such entries would exceed the size cap
 * anyway).
 */
function untar(bytes: Uint8Array): ArchiveEntry[] {
  const out: ArchiveEntry[] = [];
  const decoder = new TextDecoder();

  const readStr = (off: number, len: number): string => {
    let end = off;
    const max = off + len;
    while (end < max && bytes[end] !== 0) end++;
    return decoder.decode(bytes.subarray(off, end));
  };

  let offset = 0;
  let longName: string | null = null;

  while (offset + 512 <= bytes.length) {
    // Two consecutive zero blocks mark the end of the archive.
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (bytes[offset + i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const name = readStr(offset, 100);
    const size = parseInt(readStr(offset + 124, 12).trim(), 8) || 0;
    const typeFlag = String.fromCharCode(bytes[offset + 156] || 0);
    const prefix = readStr(offset + 345, 155);
    const dataOffset = offset + 512;

    if (typeFlag === "L") {
      // GNU long-name entry: its data is the name for the NEXT header.
      longName = decoder.decode(bytes.subarray(dataOffset, dataOffset + size)).replace(/\0+$/, "");
    } else if (typeFlag === "x") {
      // pax records, "<length> <key>=<value>\n" each; only `path` matters here.
      const records = decoder.decode(bytes.subarray(dataOffset, dataOffset + size));
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(records);
      if (path) longName = path[1];
    } else if (typeFlag === "0" || typeFlag === "\0" || typeFlag === "7") {
      const fullName = longName ?? (prefix ? `${prefix}/${name}` : name);
      longName = null;
      if (fullName) {
        out.push({ path: fullName, bytes: bytes.subarray(dataOffset, dataOffset + size) });
      }
    } else {
      longName = null;
    }

    offset = dataOffset + Math.ceil(size / 512) * 512;
  }

  return out;
}

/** Normalize and drop the entries no bundle wants, prefixing with the folder. */
function collect(base: string, entries: ArchiveEntry[]): ArchiveEntry[] {
  const out: ArchiveEntry[] = [];
  for (const entry of entries) {
    // tar entries are often prefixed with "./"; normalize so paths stay clean.
    const name = entry.path.replace(/^\.\//, "");
    if (!name || name.endsWith("/")) continue; // directory entry
    if (isCruft(name)) continue;
    out.push({ path: base ? `${base}/${name}` : name, bytes: entry.bytes });
  }
  return out;
}

/**
 * Root the files a platform's wasm reader unpacked (`path` relative to the
 * archive) the way {@link expandArchive} roots its own. Such a reader opens one
 * layer, so a `.tar.bz2` comes back as its tar, which core unpacks; a lone
 * compressed file lands at the root, as a `.gz` one does.
 */
export function rootArchiveEntries(
  entries: ArchiveEntry[],
  kind: ArchiveKind,
  name: string,
): ArchiveEntry[] {
  const base = stripArchiveSuffix(name);
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only && isTarHeader(only.bytes)) return collect(base, untar(only.bytes));
  if (only && (kind === "bz2" || kind === "xz")) {
    return [{ path: only.path.split("/").pop() || only.path, bytes: only.bytes }];
  }
  return collect(base, entries);
}

/** Bytes 0x80-0xFF of code page 437, the zip spec's encoding for a name without the UTF-8 flag. */
const CP437_HIGH = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

/** An Info-ZIP Unicode Path field (0x7075), trusted only while its CRC still
 * matches the stored name, so a tool that renamed the entry without knowing the
 * field cannot resurrect the old name. */
function unicodePath(extra: Uint8Array, name: Uint8Array): string | undefined {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  for (let at = 0; at + 4 <= extra.length; at += 4 + view.getUint16(at + 2, true)) {
    const size = view.getUint16(at + 2, true);
    if (view.getUint16(at, true) !== 0x7075 || size < 5 || at + 4 + size > extra.length) continue;
    if (extra[at + 4] !== 1 || view.getUint32(at + 5, true) !== crc32(name)) continue;
    return decodeUtf8(extra.subarray(at + 9, at + 4 + size));
  }
  return undefined;
}

/**
 * The real names of the entries whose name is not flagged UTF-8, keyed by the
 * Latin-1 reading fflate gives them. The spec says CP437, and macOS, Linux and
 * most tools write UTF-8 without the flag, so the order is zip.js's and 7-Zip's:
 * the Unicode Path field, then UTF-8 when every such name in the archive is valid
 * UTF-8 (decided per archive, because a short CP866 name can pass alone), then
 * CP437. fflate exposes neither the flag nor the extra fields, hence the walk
 * over the central directory.
 *
 * ponytail: a Windows zip in a non-US OEM code page (CP857 Turkish, CP866
 * Russian) still comes out as CP437 symbols; a locale-guessed code page if the
 * counters show such zips.
 */
function zipNames(bytes: Uint8Array): Map<string, string> {
  const names = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const floor = Math.max(0, end - 0xffff);
  while (end >= floor && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < floor) return names;
  let count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  // ponytail: a zip64 directory keeps fflate's Latin-1 names.
  if (count === 0xffff || at === 0xffffffff) return names;

  const unflagged: { name: Uint8Array; unicode?: string }[] = [];
  for (; count > 0 && at + 46 <= bytes.length && view.getUint32(at, true) === 0x02014b50; count--) {
    const nameEnd = at + 46 + view.getUint16(at + 28, true);
    const extraEnd = nameEnd + view.getUint16(at + 30, true);
    const name = bytes.subarray(at + 46, nameEnd);
    if (!(view.getUint16(at + 8, true) & 0x800)) {
      const unicode = unicodePath(bytes.subarray(nameEnd, extraEnd), name);
      if (unicode !== undefined || name.some((byte) => byte > 0x7f)) unflagged.push({ name, unicode });
    }
    at = extraEnd + view.getUint16(at + 32, true);
  }

  const asUtf8 = unflagged.every((entry) => entry.unicode !== undefined || decodeUtf8(entry.name) !== undefined);
  for (const { name, unicode } of unflagged) {
    const latin1 = String.fromCharCode(...name);
    const cp437 = () => Array.from(name, (byte) => (byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80])).join("");
    names.set(latin1, unicode ?? (asUtf8 ? decodeUtf8(name)! : cp437()));
  }
  return names;
}

/**
 * Unpack an archive's bytes into its entries, each rooted at a folder named
 * after the archive. Returns an empty array for an archive that holds nothing
 * we'd keep, and for a kind this build cannot open — callers check
 * {@link canExpandArchive} first when they need to tell those apart. Throws only
 * on corrupt input, which callers treat as "leave the original alone".
 */
export function expandArchive(bytes: Uint8Array, kind: ArchiveKind, name: string): ArchiveEntry[] {
  const base = stripArchiveSuffix(name);

  if (kind === "zip") {
    const names = zipNames(bytes);
    return collect(
      base,
      Object.entries(unzipSync(bytes)).map(([path, data]) => ({
        path: (names.get(path) ?? path).normalize("NFC"),
        bytes: data,
      })),
    );
  }

  if (kind === "tar") {
    return collect(base, untar(bytes));
  }

  if (kind === "gz") {
    const inner = gunzipSync(bytes);
    // A gzipped tar is the common case and is detected from the decompressed
    // bytes, so `logs.tar.gz`, `logs.tgz` and a misnamed `logs.gz` all unpack.
    if (isTarHeader(inner)) return collect(base, untar(inner));
    // Otherwise it is a single gzipped file: <name>.gz -> <name>, at the root.
    const fileName = base.split("/").pop() || base;
    return fileName ? [{ path: fileName, bytes: inner }] : [];
  }

  return [];
}
