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
export type ArchiveKind = "zip" | "tar" | "gz" | "rar" | "7z";

/** One file recovered from an archive. `path` is relative to the archive root. */
export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

/**
 * What this build can actually unpack. `rar` and `7z` are routed but not
 * expandable: they need a wasm reader we do not ship yet, so they surface as
 * unsupported instead of being silently mistaken for opaque binaries.
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
  return name.replace(/\.(tar\.gz|tgz|tar\.bz2|zip|tar|gz|rar|7z)$/i, "");
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
 * Minimal ustar / GNU tar reader. Returns regular files only; directories,
 * symlinks, and pax/global headers are skipped. GNU long names (`L` typeflag)
 * are honored; base-256 large sizes are not (rare, and such entries would
 * exceed the size cap anyway).
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
    } else if (typeFlag === "0" || typeFlag === "\0") {
      const fullName = longName ?? (prefix ? `${prefix}/${name}` : name);
      longName = null;
      if (fullName && size > 0) {
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
 * Unpack an archive's bytes into its entries, each rooted at a folder named
 * after the archive. Returns an empty array for an archive that holds nothing
 * we'd keep, and for a kind this build cannot open — callers check
 * {@link canExpandArchive} first when they need to tell those apart. Throws only
 * on corrupt input, which callers treat as "leave the original alone".
 */
export function expandArchive(bytes: Uint8Array, kind: ArchiveKind, name: string): ArchiveEntry[] {
  const base = stripArchiveSuffix(name);

  if (kind === "zip") {
    return collect(
      base,
      Object.entries(unzipSync(bytes)).map(([path, data]) => ({ path, bytes: data })),
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
