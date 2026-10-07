import {
  canExpandArchive,
  classifyBytes,
  type ArchiveEntry,
  expandArchive,
  routeBytes,
  ROUTER_SNIFF_BYTES,
  type ArchiveKind,
  type FileRoute,
  type TextClassification,
} from "@fileconcat/core";

import type { IncomingFile } from "~/hooks/use-file-ingestion";
import type { PreparedBatch, PrepareProgress, RoutedFile } from "./prepare-batch";
import { mergePruned, pruneAtDoor, type PrunedAtDoor } from "./prune-at-door";

/**
 * Client-only batch preparation. Reached solely through the dynamic import in
 * ./prepare-batch, which is what keeps `file-type` — pulled in statically by
 * core's router — out of the Cloudflare SSR worker bundle. Vite inlines
 * dynamic imports in the SSR build, so a lazy `import()` alone would not have
 * been enough; the `import.meta.env.SSR` guard next door is what makes this
 * module dead code there.
 *
 * Archives are opened here and their entries flow through the same pipeline as
 * loose files, each routed on its own bytes, after the same door prune the
 * drop itself went through: a build zip's fonts and node_modules are turned
 * away unread, as they would be beside it. Nesting is one level deep: a zip
 * inside a zip stays packed, exactly as before.
 */
export async function prepareBatch(
  incoming: IncomingFile[],
  onProgress?: PrepareProgress,
): Promise<PreparedBatch> {
  const files: RoutedFile[] = [];
  const unsupported: ArchiveKind[] = [];
  const archiveReads: string[] = [];
  let expandedCount = 0;
  let pruned: PrunedAtDoor | null = null;
  // Routing reads the leading bytes of every file, one round-trip each, which
  // on a few thousand files is long enough that the screen has to say so.
  // Cap re-renders at ~100 ticks regardless of how large the drop is.
  const tick = Math.max(1, Math.floor(incoming.length / 100));

  for (let index = 0; index < incoming.length; index++) {
    const item = incoming[index];
    if (index % tick === 0) onProgress?.(index, incoming.length);
    const path = item.path || item.file.webkitRelativePath || item.file.name;

    // Remote sources arrive already decoded — there are no container bytes to
    // read, so they are never candidates for extraction or expansion.
    if (item.content !== undefined) {
      files.push({ item, path, route: { kind: "unknown" } });
      continue;
    }

    // Sniffing reads the file's leading bytes, and that read can fail for
    // reasons that have nothing to do with the batch: a file that moved, a
    // permission, a network path that blinked. Unguarded, one rejection here
    // took the whole drop down and the screen said "nothing text-like to
    // combine" about files it never opened. Route it as unknown instead and
    // let the ingest loop's own per-file handling record it as unreadable.
    const { route, sniffed } = await item.file
      .slice(0, ROUTER_SNIFF_BYTES)
      .arrayBuffer()
      .then((buffer) => sniff(new Uint8Array(buffer)))
      .catch(() => ({ route: { kind: "unknown" } as const, sniffed: undefined }));
    if (route.kind !== "expand") {
      files.push({ item, path, route, sniffed });
      continue;
    }

    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const { entries, reader } = await unpack(bytes, route.archive, item.file.name);
      archiveReads.push(`${route.archive}/${reader}`);
      // An empty or unreadable archive keeps its original entry and falls
      // through to the usual skip handling.
      if (entries.length === 0) {
        files.push({ item, path, route });
        continue;
      }
      // An Office package whose content-types part sits past the sniff window
      // (a LibreOffice-shaped .docx with its thumbnail first, say) routes as a
      // plain zip on its prefix, and unpacking it would put forty XML parts in
      // the tree in place of one document. The part is the tell; the whole
      // file settles it, and a zip someone made of a folder never carries it.
      // Entries come back rooted at a folder named after the archive.
      if (entries.some((entry) => /^(?:[^/]+\/)?\[Content_Types\]\.xml$/.test(entry.path))) {
        const whole = await routeBytes(bytes);
        if (whole.kind !== "expand") {
          files.push({ item, path, route: whole });
          continue;
        }
      }

      expandedCount++;
      const unpacked = entries.map((entry) => ({
        file: new File([entry.bytes], entry.path.split("/").pop() || entry.path),
        path: entry.path,
        bytes: entry.bytes,
      }));
      const door = pruneAtDoor(unpacked);
      // The stem is exempt like a dropped root but nobody dropped it, so it
      // is not reported as one.
      if (door.pruned.count > 0) pruned = mergePruned(pruned, { ...door.pruned, roots: [] });
      for (const { bytes: entryBytes, ...entryItem } of door.kept) {
        files.push({
          item: entryItem,
          path: entryItem.path,
          // Routed from the bytes we already hold rather than re-reading the
          // synthetic File we just built.
          ...(await sniff(entryBytes.subarray(0, ROUTER_SNIFF_BYTES))),
        });
      }
    } catch {
      archiveReads.push(`${route.archive}/none`);
      files.push({ item, path, route });
    }
  }

  return { files, expandedCount, unsupported, archiveReads, pruned };
}

/**
 * Core's fflate first (zip, tar, gz); 7-Zip in a worker for what it cannot
 * open or throws on (7z, rar, bz2, xz, a zip with bzip2 or LZMA entries).
 * Extraction router, step R2. Throws when neither opens it, which callers
 * treat as "leave the original alone".
 */
async function unpack(
  bytes: Uint8Array,
  kind: ArchiveKind,
  name: string,
): Promise<{ entries: ArchiveEntry[]; reader: string }> {
  if (canExpandArchive(kind)) {
    try {
      return { entries: expandArchive(bytes, kind, name), reader: "fflate" };
    } catch {
      // An entry method fflate lacks; 7-Zip reads every one it does.
    }
  }
  const { expandWithSevenZip } = await import("./expand-sevenzip-client");
  return { entries: await expandWithSevenZip(bytes, kind, name), reader: "7zip" };
}

/**
 * Route a prefix and, where the route leaves the question open, classify the
 * same bytes. One read serves both; see `RoutedFile.sniffed`.
 */
async function sniff(prefix: Uint8Array): Promise<{ route: FileRoute; sniffed?: TextClassification }> {
  const route = await routeBytes(prefix);
  if (route.kind === "binary") return { route, sniffed: "binary" };
  if (route.kind === "unknown") return { route, sniffed: classifyBytes(prefix).classification };
  return { route };
}
