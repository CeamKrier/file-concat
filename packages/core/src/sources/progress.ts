import type { DownloadProgress } from "../types";

export interface ProgressReporterOptions {
  /** Total number of files the adapter expects to fetch. */
  totalFiles: number;
  /**
   * Total payload size in bytes, if the adapter knows it up front. When
   * `undefined`, the reporter operates in file-count mode and `downloadedBytes`
   * / `totalBytes` / `speed` are reported as `0`.
   */
  totalBytes?: number;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface ProgressReporter {
  /** Record received bytes for the active file (streaming adapters only). */
  bytesReceived(currentFile: string, addedBytes: number): void;
  /** Mark the current file as complete. */
  fileComplete(currentFile: string): void;
}

const SPEED_WINDOW_MS = 500;

/**
 * Adapter-agnostic progress reporter. The GitHub adapter streams chunks
 * (`bytesReceived` during reads, `fileComplete` after each file), the
 * GitLab/Bitbucket adapters work file-by-file (`fileComplete` only, no
 * `totalBytes`). Either pattern emits a well-typed {@link DownloadProgress}.
 */
export function createProgressReporter(options: ProgressReporterOptions): ProgressReporter {
  const { totalFiles, totalBytes = 0, onProgress } = options;
  const tracksBytes = options.totalBytes !== undefined;

  let completedFiles = 0;
  let downloadedBytes = 0;
  let speed = 0;
  let lastUpdate = Date.now();
  let lastBytes = 0;

  const emit = (currentFile: string) => {
    onProgress?.({ currentFile, totalFiles, completedFiles, downloadedBytes, totalBytes, speed });
  };

  return {
    bytesReceived(currentFile, addedBytes) {
      if (!tracksBytes) return;
      downloadedBytes += addedBytes;
      const now = Date.now();
      const elapsed = now - lastUpdate;
      if (elapsed > SPEED_WINDOW_MS) {
        speed = (downloadedBytes - lastBytes) / (elapsed / 1000);
        lastUpdate = now;
        lastBytes = downloadedBytes;
      }
      emit(currentFile);
    },
    fileComplete(currentFile) {
      completedFiles += 1;
      emit(currentFile);
    },
  };
}
