import type { ArchiveKind, FileRoute, TextClassification } from "@fileconcat/core";

import type { IncomingFile } from "~/hooks/use-file-ingestion";

/** An incoming file with its route already decided, so nothing is sniffed twice. */
export interface RoutedFile {
  item: IncomingFile;
  path: string;
  route: FileRoute;
  /**
   * What the bytes the router sniffed read as, when it could tell: a signature
   * names a binary, and the byte classifier settles an `unknown` route from
   * the same prefix. The read loop then validates without a second read of
   * the same 8 KB, which on a drop of ten thousand never-readable files is
   * the difference between one pass over the disk and two. Absent when the
   * prefix could not be read, or when the route already decides (a document
   * is extracted, an archive expanded).
   */
  sniffed?: TextClassification;
}

/** Called with files routed so far, so a slow batch can report live progress. */
export type PrepareProgress = (done: number, total: number) => void;

export interface PreparedBatch {
  files: RoutedFile[];
  /** How many archives were successfully unpacked. */
  expandedCount: number;
  /** Kinds of archive this build can't open (rar, 7z), one entry per archive found. */
  unsupported: ArchiveKind[];
}

/**
 * Route every incoming file once and unpack the archives among them, so the
 * ingest loop can act without sniffing anything a second time (ADR-0011).
 *
 * The work lives in ./prepare-batch-client and is only dynamically imported on
 * the client, so core's router — and the `file-type` detector it pulls in —
 * never enter the Cloudflare SSR worker bundle. Mirrors tokens.ts and parsers.ts.
 */
export async function prepareBatch(
  incoming: IncomingFile[],
  onProgress?: PrepareProgress,
): Promise<PreparedBatch> {
  if (import.meta.env.SSR) return { files: [], expandedCount: 0, unsupported: [] };
  const mod = await import("./prepare-batch-client");
  return mod.prepareBatch(incoming, onProgress);
}
