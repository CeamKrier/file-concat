import { rootArchiveEntries, type ArchiveEntry, type ArchiveKind } from "@fileconcat/core";

import { workerRunner } from "./worker-runner";

/**
 * The fallback archive reader (extraction router, step R2): 7-Zip wasm, 0.63
 * MiB gzipped, fetched only for an archive core's fflate cannot open (7z, rar,
 * bz2, xz, a zip with bzip2 or LZMA entries). On the built archive corpus it
 * unpacked 24 of 26 exactly; on libarchive's real rar and 7z test files it
 * returned files for 44 of 80 and 57 of 75, against libarchive-wasm's 28 and
 * 43 (measured 2026-10-05).
 */

// ponytail: one fixed limit; an archive past it stays packed, as before R2.
const unpack = workerRunner<{ name: string; bytes: Uint8Array }, ArchiveEntry[]>(
  () => new Worker(new URL("./sevenzip.worker.ts", import.meta.url), { type: "module" }),
  120_000,
);

export async function expandWithSevenZip(
  bytes: Uint8Array,
  kind: ArchiveKind,
  name: string,
): Promise<ArchiveEntry[]> {
  // A copy is handed over, so the caller's bytes stay usable.
  const copy = bytes.slice();
  return rootArchiveEntries(await unpack({ name, bytes: copy }, [copy.buffer]), kind, name);
}
