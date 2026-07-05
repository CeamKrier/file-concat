import { useCallback, useRef, useState } from "react";
import type {
  DownloadProgress,
  ProcessingConfig,
  SourceType,
  TextClassification,
} from "@fileconcat/core";
import { defaultSourceRegistry, readFileAsText, validateFile } from "@fileconcat/core";

import { collectFromDataTransfer } from "~/lib/collect-from-drop";
import { expandArchives } from "~/lib/expand-archives";

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
};

export type IncomingFile = {
  file: File;
  path?: string;
  content?: string;
};

export type FailedFile = { path: string; error: string };

export type IngestPhase = "unpacking" | "reading" | "fetching";
/** Live progress for the processing view. `total === 0` means indeterminate. */
export type IngestProgress = { phase: IngestPhase; done: number; total: number } | null;

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
      // Unpack any dropped/browsed zip archives before validation so their
      // contents flow through the same pipeline. Remote fetches arrive with
      // content set, so they are never treated as archives.
      const { files: expanded, expandedCount } = await expandArchives(incoming);
      setExpandedArchive(expandedCount > 0);

      const normalized = expanded.map((entry) => {
        const path = entry.path || entry.file.webkitRelativePath || entry.file.name;
        return { ...entry, path };
      });

      const nextEntries: ContentEntry[] = [];
      const nextValidations: Record<string, ValidationRecord> = {};
      const nextFailed: FailedFile[] = [];

      const total = normalized.length;
      // Cap re-renders at ~100 progress ticks regardless of how large the drop is.
      const tick = Math.max(1, Math.floor(total / 100));
      setProgress({ phase: "reading", done: 0, total });

      for (let i = 0; i < total; i++) {
        const entry = normalized[i];
        const result = await validateFile(entry.file, config);
        nextValidations[entry.path] = {
          included: result.isValid,
          reason: result.reason,
          classification: result.classification,
          size: entry.file.size,
          type: entry.file.type || "text/plain",
        };

        try {
          // Decode through the core classifier so odd encodings (e.g. UTF-16)
          // read as real text instead of UTF-8 mojibake. Remote sources already
          // arrive decoded, so their content passes through untouched.
          const content =
            entry.content !== undefined ? entry.content : (await readFileAsText(entry.file)).text;
          nextEntries.push({ path: entry.path, content });
        } catch (error) {
          console.error(`Failed to read file ${entry.path}:`, error);
          nextFailed.push({ path: entry.path, error: "File could not be read" });
        }

        if ((i + 1) % tick === 0 || i + 1 === total) {
          setProgress({ phase: "reading", done: i + 1, total });
        }
      }

      setEntries(nextEntries);
      setValidations(nextValidations);
      setFailedFiles(nextFailed);
    },
    [config],
  );

  const ingestRepo = useCallback(
    async (url: string, sourceType: SourceType, signal: AbortSignal) => {
      setIsRepoLoading(true);
      setSourceUrl(url);
      setProgress({ phase: "fetching", done: 0, total: 0 });
      try {
        const adapter = defaultSourceRegistry.getByType(sourceType);
        if (!adapter) throw new Error("Unknown source type");

        const onProgress = (p: DownloadProgress) =>
          setProgress({ phase: "fetching", done: p.completedFiles, total: p.totalFiles });
        const { files, error } = await adapter.fetchFiles(url, { onProgress, signal });
        if (error) throw new Error(error);

        const incoming: IncomingFile[] = [];
        for (const remote of files) {
          if (signal.aborted) throw new Error("Operation aborted");
          const blob = new Blob([remote.content || ""], { type: remote.type });
          const fileObj = new File([blob], remote.name, { type: remote.type });
          incoming.push({ file: fileObj, path: remote.path, content: remote.content || "" });
        }
        await ingestBatch(incoming);
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
