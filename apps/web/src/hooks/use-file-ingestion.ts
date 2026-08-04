import { useCallback, useRef, useState } from "react";
import type {
  DownloadProgress,
  ProcessingConfig,
  SourceType,
  TextClassification,
} from "@fileconcat/core";
import { defaultSourceRegistry, readFileAsText, validateFile } from "@fileconcat/core";

import { collectFromDataTransfer } from "~/lib/collect-from-drop";
import { track, trackBatchSize, trackDistinct, trackIngestDuration } from "~/lib/metrics";
import { parsers } from "~/lib/parsers";
import { prepareBatch } from "~/lib/prepare-batch";

/** Final extension, lowercased — the only thing a counter ever carries from a path. */
function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// Directories that never make it into memory. These are not user-editable;
// dropping their contents into a browser tab would crash the page long before
// any pattern could filter them. Everything else honors the live filter rail.
const HARDCODED_PRUNE_DIRS = new Set([".git", "node_modules"]);

export type ContentEntry = { path: string; content: string };

export type ValidationRecord = {
  included: boolean;
  reason?: string;
  /** text / binary / ambiguous — undefined when binary checking is off. */
  classification?: TextClassification;
  size: number;
  type: string;
  /** True when this entry's content is text pulled out of an extractable
   * document (PDF/Office/ODF) rather than the file's own bytes (ADR-0003). */
  extracted?: boolean;
};

export type IncomingFile = {
  file: File;
  path?: string;
  content?: string;
};

export type FailedFile = { path: string; error: string };

export type IngestPhase = "unpacking" | "reading" | "fetching";
/**
 * Live progress for the processing view. `total === 0` means indeterminate.
 * `note` is the current coarse stage ("Listing files", "Downloading files")
 * shown while a numeric total isn't known yet, so the spinner is never silent.
 */
export type IngestProgress = {
  phase: IngestPhase;
  done: number;
  total: number;
  note?: string;
} | null;

export interface FileIngestion {
  entries: ContentEntry[];
  validations: Record<string, ValidationRecord>;
  failedFiles: FailedFile[];
  sourceUrl: string | null;
  isProcessing: boolean;
  isRepoLoading: boolean;
  processingStatus: string;
  isDragging: boolean;
  /** True when the last batch unpacked at least one archive. */
  expandedArchive: boolean;
  /** Live read/fetch progress for the processing view, or null when idle. */
  progress: IngestProgress;
  ingestBatch: (incoming: IncomingFile[]) => Promise<void>;
  ingestRepo: (url: string, sourceType: SourceType, signal: AbortSignal) => Promise<void>;
  setEntryContent: (path: string, content: string) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  reset: () => void;
}

export function useFileIngestion(config: ProcessingConfig): FileIngestion {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [validations, setValidations] = useState<Record<string, ValidationRecord>>({});
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [expandedArchive, setExpandedArchive] = useState(false);
  const [progress, setProgress] = useState<IngestProgress>(null);
  const dragCounter = useRef(0);

  const ingestBatch = useCallback(
    async (incoming: IncomingFile[]) => {
      const startedAt = performance.now();

      // One pass decides every file's route from its own leading bytes and
      // unpacks the archives among them (ADR-0011), so nothing below sniffs a
      // file twice.
      const { files: routed, expandedCount, unsupported } = await prepareBatch(incoming);
      setExpandedArchive(expandedCount > 0);
      trackDistinct("archive_unsupported", unsupported);

      const nextEntries: ContentEntry[] = [];
      const nextValidations: Record<string, ValidationRecord> = {};
      const nextFailed: FailedFile[] = [];
      // Counters are collected here and reported once per batch, deduplicated by
      // extension (ADR-0013): a folder of 200 screenshots is one data point
      // about png, not two hundred.
      const unreadable: string[] = [];
      const extractFailed: string[] = [];

      const total = routed.length;
      // Cap re-renders at ~100 progress ticks regardless of how large the drop is.
      const tick = Math.max(1, Math.floor(total / 100));
      setProgress({ phase: "reading", done: 0, total });

      for (let i = 0; i < total; i++) {
        const { item: entry, path, route } = routed[i];
        const tickProgress = () => {
          if ((i + 1) % tick === 0 || i + 1 === total) {
            setProgress({ phase: "reading", done: i + 1, total });
          }
        };

        // A document container: pull the text out and include *that*, instead
        // of classifying the container's raw bytes (ADR-0003). Which parser to
        // load came from the bytes, not the filename, so a renamed `.docx` and
        // an extensionless PDF both land here.
        if (route.kind === "extract") {
          const size = entry.file.size;
          const type = entry.file.type || "application/octet-stream";
          if (size > config.maxFileSizeMB * 1024 * 1024) {
            nextValidations[path] = {
              included: false,
              reason: `File size exceeds ${config.maxFileSizeMB}MB`,
              size,
              type,
            };
          } else {
            try {
              const bytes = new Uint8Array(await entry.file.arrayBuffer());
              const { text } = await parsers.extract(route.parserId, bytes);
              if (text) {
                nextEntries.push({ path, content: text });
                nextValidations[path] = {
                  included: true,
                  classification: "text",
                  size,
                  type,
                  extracted: true,
                };
              } else {
                // No recoverable text (scanned image-only or encrypted PDF, or
                // a format this build ships no reader for) — surfaced as
                // excluded, never silently dropped.
                extractFailed.push(route.format);
                nextValidations[path] = {
                  included: false,
                  reason: "No extractable text",
                  classification: "binary",
                  size,
                  type,
                };
              }
            } catch (error) {
              console.error(`Failed to extract ${path}:`, error);
              extractFailed.push(route.format);
              nextValidations[path] = {
                included: false,
                reason: "Couldn't extract text",
                classification: "binary",
                size,
                type,
              };
            }
          }
          tickProgress();
          continue;
        }

        const result = await validateFile(entry.file, config);
        nextValidations[path] = {
          included: result.isValid,
          reason: result.reason,
          classification: result.classification,
          size: entry.file.size,
          type: entry.file.type || "text/plain",
        };

        if (result.classification === "binary") {
          // Which formats users bring that we cannot read at all. This is the
          // demand signal that decides which reader to build next. An archive
          // we can't open (rar, 7z) lands here too, under its own extension.
          unreadable.push(extensionOf(path));
          // Binary: no recoverable text. Keep it visible in the tree (locked,
          // ADR-0009) but never decode its bytes — a force-include must not be
          // able to leak mojibake into the bundle, and decoding it is wasted work.
          nextEntries.push({ path, content: "" });
        } else {
          try {
            // Decode through the core classifier so odd encodings (e.g. UTF-16)
            // read as real text instead of UTF-8 mojibake. Remote sources already
            // arrive decoded, so their content passes through untouched.
            const content =
              entry.content !== undefined ? entry.content : (await readFileAsText(entry.file)).text;
            nextEntries.push({ path, content });
          } catch (error) {
            console.error(`Failed to read file ${path}:`, error);
            nextFailed.push({ path, error: "File could not be read" });
          }
        }

        if ((i + 1) % tick === 0 || i + 1 === total) {
          setProgress({ phase: "reading", done: i + 1, total });
        }
      }

      setEntries(nextEntries);
      setValidations(nextValidations);
      setFailedFiles(nextFailed);

      trackBatchSize(total);
      trackIngestDuration(performance.now() - startedAt);
      trackDistinct("unreadable_ext", unreadable);
      trackDistinct("extract_failed", extractFailed);
    },
    [config],
  );

  const ingestRepo = useCallback(
    async (url: string, sourceType: SourceType, signal: AbortSignal) => {
      setIsRepoLoading(true);
      setSourceUrl(url);
      // Which remote adapters actually earn their maintenance cost.
      track("source_used", sourceType);
      // Immediate feedback: the spinner shows a stage before the first network
      // round-trip resolves, so a slow connect never reads as "frozen".
      setProgress({ phase: "fetching", done: 0, total: 0, note: "Connecting…" });
      try {
        const adapter = defaultSourceRegistry.getByType(sourceType);
        if (!adapter) throw new Error("Unknown source type");

        // Coarse stages (connect / list / download) drive the heading during
        // the pre-download window; numeric progress takes over once totals land.
        const onStatus = (message: string) =>
          setProgress((prev) => ({
            phase: "fetching",
            done: prev?.done ?? 0,
            total: prev?.total ?? 0,
            note: message,
          }));
        const onProgress = (p: DownloadProgress) =>
          setProgress((prev) => ({
            phase: "fetching",
            done: p.completedFiles,
            total: p.totalFiles,
            note: prev?.note,
          }));
        const { files, error, failures } = await adapter.fetchFiles(url, {
          onProgress,
          onStatus,
          signal,
        });
        if (error) throw new Error(error);

        const incoming: IncomingFile[] = [];
        for (const remote of files) {
          if (signal.aborted) throw new Error("Operation aborted");
          const blob = new Blob([remote.content || ""], { type: remote.type });
          const fileObj = new File([blob], remote.name, { type: remote.type });
          incoming.push({ file: fileObj, path: remote.path, content: remote.content || "" });
        }
        await ingestBatch(incoming);
        // ingestBatch replaces failedFiles with its own read failures, so append
        // the adapter's download failures afterwards. Files that were listed but
        // couldn't be fetched are surfaced, never silently dropped (ADR-0004).
        if (failures?.length) {
          setFailedFiles((prev) => [
            ...prev,
            ...failures.map((f) => ({ path: f.path, error: f.reason })),
          ]);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Repository fetch aborted");
        }
        throw error;
      } finally {
        setIsRepoLoading(false);
      }
    },
    [ingestBatch],
  );

  const setEntryContent = useCallback((path: string, content: string) => {
    setEntries((prev) => prev.map((e) => (e.path === path ? { ...e, content } : e)));
    setValidations((prev) => {
      const record = prev[path];
      if (!record) return prev;
      const size = new TextEncoder().encode(content).length;
      return { ...prev, [path]: { ...record, size } };
    });
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected || selected.length === 0) return;

      setSourceUrl(null);
      setIsProcessing(true);
      try {
        const incoming: IncomingFile[] = Array.from(selected).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));
        await ingestBatch(incoming);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        e.target.value = "";
        setIsProcessing(false);
      }
    },
    [ingestBatch],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSourceUrl(null);
      setIsDragging(false);
      dragCounter.current = 0;
      setIsProcessing(true);
      setProcessingStatus("Scanning files...");
      // Walking a large dropped folder can take a beat before the read loop
      // starts reporting counts — show the stage so it isn't a silent spinner.
      setProgress({ phase: "reading", done: 0, total: 0, note: "Scanning files…" });

      try {
        const { collected, failed } = await collectFromDataTransfer(e.dataTransfer.items, {
          skipDir: (name) => HARDCODED_PRUNE_DIRS.has(name),
        });
        const incoming: IncomingFile[] = collected.map(({ file, path }) => ({ file, path }));
        setProcessingStatus(`Processing ${incoming.length} files...`);
        await ingestBatch(incoming);
        if (failed.length > 0) setFailedFiles((prev) => [...prev, ...failed]);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    },
    [ingestBatch],
  );

  const reset = useCallback(() => {
    setEntries([]);
    setValidations({});
    setFailedFiles([]);
    setSourceUrl(null);
    setIsProcessing(false);
    setIsRepoLoading(false);
    setProcessingStatus("");
    setIsDragging(false);
    setExpandedArchive(false);
    setProgress(null);
    dragCounter.current = 0;
  }, []);

  return {
    entries,
    validations,
    failedFiles,
    sourceUrl,
    isProcessing,
    isRepoLoading,
    processingStatus,
    isDragging,
    expandedArchive,
    progress,
    ingestBatch,
    ingestRepo,
    setEntryContent,
    handleFileInput,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    reset,
  };
}
