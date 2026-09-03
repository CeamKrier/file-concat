import {
  canExpandArchive,
  expandArchive,
  routeBytes,
  routeFile,
  ROUTER_SNIFF_BYTES,
  type ArchiveKind,
} from "@fileconcat/core";

import type { IncomingFile } from "~/hooks/use-file-ingestion";
import type { PreparedBatch, PrepareProgress, RoutedFile } from "./prepare-batch";

/**
 * Client-only batch preparation. Reached solely through the dynamic import in
 * ./prepare-batch, which is what keeps `file-type` — pulled in statically by
 * core's router — out of the Cloudflare SSR worker bundle. Vite inlines
 * dynamic imports in the SSR build, so a lazy `import()` alone would not have
 * been enough; the `import.meta.env.SSR` guard next door is what makes this
 * module dead code there.
 *
 * Archives are opened here and their entries flow through the same pipeline as
 * loose files, each routed on its own bytes. Nesting is one level deep: a zip
 * inside a zip stays packed, exactly as before.
 */
export async function prepareBatch(
  incoming: IncomingFile[],
  onProgress?: PrepareProgress,
): Promise<PreparedBatch> {
  const files: RoutedFile[] = [];
  const unsupported: ArchiveKind[] = [];
  let expandedCount = 0;
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
    const route = await routeFile(item.file).catch(() => ({ kind: "unknown" }) as const);
    if (route.kind !== "expand") {
      files.push({ item, path, route });
      continue;
    }

    if (!canExpandArchive(route.archive)) {
      unsupported.push(route.archive);
      // Kept, so it still surfaces as a skipped non-text file rather than
      // disappearing from the tree without explanation.
      files.push({ item, path, route });
      continue;
    }

    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const entries = expandArchive(bytes, route.archive, item.file.name);
      // An empty or unreadable archive keeps its original entry and falls
      // through to the usual skip handling.
      if (entries.length === 0) {
        files.push({ item, path, route });
        continue;
      }

      expandedCount++;
      for (const entry of entries) {
        const name = entry.path.split("/").pop() || entry.path;
        files.push({
          item: { file: new File([entry.bytes], name), path: entry.path },
          path: entry.path,
          // Routed from the bytes we already hold rather than re-reading the
          // synthetic File we just built.
          route: await routeBytes(entry.bytes.subarray(0, ROUTER_SNIFF_BYTES)),
        });
      }
    } catch {
      files.push({ item, path, route });
    }
  }

  return { files, expandedCount, unsupported };
}
