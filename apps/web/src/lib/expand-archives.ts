import { gunzipSync, unzipSync } from "fflate";

import type { IncomingFile } from "~/hooks/use-file-ingestion";

export interface ExpandArchivesResult {
  /** The batch with every readable archive replaced by its entries. */
  files: IncomingFile[];
  /** How many archives were successfully unpacked. */
  expandedCount: number;
  /** Names of archives we can't open in the browser (7z, rar). */
  unsupported: string[];
}

type ArchiveKind = "zip" | "tar" | "tgz" | "gz" | "unsupported" | null;

function isCruft(name: string): boolean {
  return name.includes("__MACOSX/") || name.endsWith(".DS_Store");
}

/**
 * Only locally-sourced files (no pre-set content) are archive candidates;
 * remote fetches already arrive as decoded text. Order matters: `.tar.gz`
 * must be checked before the bare `.gz` branch.
 */
function archiveKind(item: IncomingFile): ArchiveKind {
  if (item.content !== undefined) return null;
  const name = item.file.name.toLowerCase();
  if (name.endsWith(".zip") || item.file.type === "application/zip") return "zip";
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "tgz";
  if (name.endsWith(".tar")) return "tar";
  if (name.endsWith(".7z") || name.endsWith(".rar")) return "unsupported";
  if (name.endsWith(".gz")) return "gz";
  return null;
}

/**
 * Minimal ustar / GNU tar reader. Returns `[path, bytes]` for regular files
 * only; directories, symlinks, and pax/global headers are skipped. GNU long
 * names (`L` typeflag) are honored; base-256 large sizes are not (rare, and
 * such entries would exceed the size cap anyway).
 */
function untar(bytes: Uint8Array): Array<[string, Uint8Array]> {
  const out: Array<[string, Uint8Array]> = [];
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
        out.push([fullName, bytes.subarray(dataOffset, dataOffset + size)]);
      }
    } else {
      longName = null;
    }

    offset = dataOffset + Math.ceil(size / 512) * 512;
  }

  return out;
}

function pushEntries(
  files: IncomingFile[],
  base: string,
  entries: Array<[string, Uint8Array]>,
): number {
  let added = 0;
  for (const [rawName, data] of entries) {
    // tar entries are often prefixed with "./"; normalize so paths stay clean.
    const name = rawName.replace(/^\.\//, "");
    if (!name || name.endsWith("/")) continue; // directory entry
    if (isCruft(name)) continue;
    const fileName = name.split("/").pop() || name;
    files.push({ file: new File([data], fileName), path: `${base}/${name}` });
    added++;
  }
  return added;
}

/**
 * Expand any dropped/browsed archives in place, client-side, so their contents
 * flow through the same pipeline as loose files. Supports zip, tar, tar.gz/tgz,
 * and single-file gzip. Each entry becomes a synthetic File (subject to the
 * normal binary-content and size checks) under a folder named after the
 * archive. 7z / rar are reported as `unsupported`; corrupt or empty archives
 * are left untouched and fall through to the usual skip handling.
 */
export async function expandArchives(incoming: IncomingFile[]): Promise<ExpandArchivesResult> {
  let expandedCount = 0;
  const unsupported: string[] = [];
  const files: IncomingFile[] = [];

  for (const item of incoming) {
    const kind = archiveKind(item);

    if (kind === null) {
      files.push(item);
      continue;
    }
    if (kind === "unsupported") {
      unsupported.push(item.file.name);
      files.push(item); // kept so it surfaces as a skipped, non-text file
      continue;
    }

    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const name = item.file.name;
      let added = 0;

      if (kind === "zip") {
        // Confirm the local-file-header magic ("PK\x03\x04") before unzipping.
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
          files.push(item);
          continue;
        }
        const base = name.replace(/\.zip$/i, "");
        added = pushEntries(files, base, Object.entries(unzipSync(bytes)));
      } else if (kind === "tar") {
        added = pushEntries(files, name.replace(/\.tar$/i, ""), untar(bytes));
      } else if (kind === "tgz") {
        added = pushEntries(files, name.replace(/\.(tar\.gz|tgz)$/i, ""), untar(gunzipSync(bytes)));
      } else if (kind === "gz") {
        // Single gzipped file: <name>.gz -> <name>.
        const inner = name.replace(/\.gz$/i, "");
        const fileName = inner.split("/").pop() || inner;
        files.push({ file: new File([gunzipSync(bytes)], fileName), path: fileName });
        added = 1;
      }

      if (added > 0) expandedCount++;
      else files.push(item); // empty archive: keep the original, it'll be skipped
    } catch {
      files.push(item); // corrupt / unreadable: keep the original
    }
  }

  return { files, expandedCount, unsupported };
}
