import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import SourceInput, { SourceInputRef } from "~/components/source-input";
import { TokenSection } from "~/components/token-section";
import FileTree from "~/components/file-tree";
import FileViewerModal from "~/components/file-viewer-modal";
import { FilterRail } from "~/components/filter-rail";
import { SourceBar } from "~/components/source-bar";
import { ActionBar } from "~/components/action-bar";
import { useConfig } from "~/hooks/use-config";

import {
  DownloadProgress,
  FileEntry,
  FileStatus,
  OutputFormat,
  ProcessingConfig,
  defaultSourceRegistry,
} from "@fileconcat/core";
import type { SourceType } from "@fileconcat/core";
import {
  validateFile,
  formatSize,
  estimateTokenCount,
  calculateTotalSize,
  generateFileTree,
  getLanguageFromPath,
  generateProjectName,
} from "~/utils";
import { processFileContent, assembleOutput, matchesAnyPattern } from "@fileconcat/core";
import { MULTI_OUTPUT_LIMIT, DEFAULT_CONFIG } from "@fileconcat/core";

import { useStagedFiles } from "~/components/staged-files-provider";

// Directories that never make it into memory. These are not user-editable;
// dropping their contents into a browser tab would crash the page long before
// any pattern could filter them. Everything else honors the live filter rail.
const HARDCODED_PRUNE_DIRS = new Set([".git", "node_modules"]);

const App: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [isRepoLoading, setIsRepoLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [tokens, setTokens] = useState<number>(0);
  const [rawContents, setRawContents] = useState<Array<{ path: string; content: string }>>([]);
  const [recommendedFormat, setRecommendedFormat] = useState<OutputFormat>("single");
  const [userPickedFormat, setUserPickedFormat] = useState<OutputFormat | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [config] = useState<ProcessingConfig>(DEFAULT_CONFIG);

  const [maxFileSize, setMaxFileSize] = useState<number>(32);
  const [failedFiles, setFailedFiles] = useState<Array<{ path: string; error: string }>>([]);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Live-reactive filtering: validations cache the per-file size/binary check from
  // ingestion; userToggled is the sticky manual override layer over pattern decisions.
  type ManualOverride = "include" | "exclude";
  type ValidationRecord = { included: boolean; reason?: string; size: number; type: string };
  const [validations, setValidations] = useState<Record<string, ValidationRecord>>({});
  const [userToggled, setUserToggled] = useState<Record<string, ManualOverride>>({});
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Persistent user config
  const { config: userConfig, setConfig, exportConfig, importConfig, resetConfig } = useConfig();

  // Staged files handed off from the landing route
  const { consume: consumeStagedFiles } = useStagedFiles();
  const stagedHydratedRef = useRef(false);

  const processedContents = useMemo(() => {
    return rawContents.map((file) => ({
      ...file,
      content: processFileContent(file.content, getLanguageFromPath(file.path), {
        showLineNumbers: userConfig.showLineNumbers,
      }),
    }));
  }, [rawContents, userConfig.showLineNumbers]);

  // Viewer state
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);
  const [isEditorEnabled] = useState<boolean>(true); // feature flag (can be wired to a UI toggle later)
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorDirtyByPath, setEditorDirtyByPath] = useState<Record<string, boolean>>({});
  const [editorDraftByPath, setEditorDraftByPath] = useState<Record<string, string>>({});
  const dragCounter = useRef<number>(0);
  const sourceInputRef = useRef<SourceInputRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tokens > MULTI_OUTPUT_LIMIT) {
      setRecommendedFormat("multi");
    } else {
      setRecommendedFormat("single");
    }
  }, [tokens]);

  // The format the action bar acts on. User pick wins, otherwise follow the
  // token-driven recommendation so the bar is always armed.
  const selectedFormat: OutputFormat = userPickedFormat ?? recommendedFormat;

  const processFile = useCallback(
    async (file: File, path: string, index: number): Promise<FileStatus> => {
      const validationResult = await validateFile(file, config);

      return {
        path,
        included: validationResult.isValid,
        reason: validationResult.reason,
        size: file.size,
        type: file.type || "text/plain",
        forceInclude: false,
        index,
      };
    },
    [config],
  );

  const estimateTokens = useCallback(async (content: string) => {
    try {
      const size = await calculateTotalSize(content);

      if (size > 1 * 1024 * 1024) {
        throw new Error("Input size exceeds 1MB limit");
      }

      const tokenCount = await estimateTokenCount(content);

      setTokens(tokenCount);
    } catch (error) {
      console.error("Error estimating token count:", error);
    }
  }, []);

  // Update token count when contents or config changes
  useEffect(() => {
    // Filter out disabled files
    const activeFiles = processedContents.filter((file) => {
      const status = fileStatuses.find((s) => s.path === file.path);
      return status?.included ?? false;
    });

    const combinedText = activeFiles.map((f) => f.content).join("\n");
    estimateTokens(combinedText);
  }, [processedContents, fileStatuses, estimateTokens]);

  // Include patterns override ignore patterns. If include patterns are defined,
  // anything not matching them is excluded.
  const isExcludedPath = useCallback(
    (path: string) => {
      const hasIncludePatterns = !!userConfig.includePatterns?.trim();
      if (hasIncludePatterns) {
        return !matchesAnyPattern(path, userConfig.includePatterns);
      }
      return matchesAnyPattern(path, userConfig.ignorePatterns);
    },
    [userConfig.includePatterns, userConfig.ignorePatterns],
  );

  const handleFilesBatch = useCallback(
    async (incomingFiles: Array<{ file: File; path?: string; content?: string }>) => {
      // Drop time keeps every text-y file the browser handed us. Filter patterns
      // are applied post-ingestion by the live useEffect below, so clicking a
      // preset (or editing patterns) re-evaluates the same set without re-drop.
      const normalizedEntries = incomingFiles.map((entry) => {
        const path = entry.path || entry.file.webkitRelativePath || entry.file.name;
        return { ...entry, path };
      });

      const statuses: FileStatus[] = [];
      const newFileEntries: FileEntry[] = [];
      const allContents: Array<{ path: string; content: string }> = [];
      const validationMap: Record<string, ValidationRecord> = {};
      const failedFilesList: Array<{ path: string; error: string }> = [];

      for (const entry of normalizedEntries) {
        const index = statuses.length;
        const status = await processFile(entry.file, entry.path, index);
        statuses.push(status);
        validationMap[entry.path] = {
          included: status.included,
          reason: status.reason,
          size: status.size,
          type: status.type,
        };

        try {
          const content = entry.content !== undefined ? entry.content : await entry.file.text();
          const fileEntry: FileEntry = {
            file: entry.file,
            path: entry.path,
            content,
          };

          newFileEntries.push(fileEntry);
          allContents.push({ path: fileEntry.path, content: fileEntry.content });
        } catch (error) {
          console.error(`Failed to read file ${entry.path}:`, error);
          failedFilesList.push({ path: entry.path, error: "File could not be read" });
        }
      }

      setFiles(newFileEntries);
      setFileStatuses(statuses);
      setValidations(validationMap);
      setUserToggled({});
      setRawContents(allContents);
      setFailedFiles(failedFilesList);

      const initiallyIncluded = allContents.filter((c) => validationMap[c.path]?.included);
      if (initiallyIncluded.length > 0) {
        await estimateTokens(initiallyIncluded.map((c) => c.content).join("\n"));
      } else {
        setTokens(0);
      }
    },
    [estimateTokens, processFile],
  );

  // Hydrate from staged-files handoff (landing → /app)
  useEffect(() => {
    if (stagedHydratedRef.current) return;
    const staged = consumeStagedFiles();
    if (staged && staged.length > 0) {
      stagedHydratedRef.current = true;
      handleFilesBatch(staged.map(({ file, path, content }) => ({ file, path, content })));
    }
  }, [consumeStagedFiles, handleFilesBatch]);

  // What would the pattern + validation layer decide for this path, ignoring overrides?
  const patternDecision = useCallback(
    (path: string): boolean => {
      const validation = validations[path];
      if (!validation || !validation.included) return false;
      return !isExcludedPath(path);
    },
    [validations, isExcludedPath],
  );

  // Live-reactive recompute. Patterns or override layer changes flow into fileStatuses.
  useEffect(() => {
    if (files.length === 0) return;
    setFileStatuses((prev) =>
      prev.map((status) => {
        const override = userToggled[status.path];
        const validation = validations[status.path];
        const validatedIncluded = validation?.included ?? status.included;
        let included: boolean;
        let forceInclude = false;
        if (override === "include") {
          included = true;
          forceInclude = true;
        } else if (override === "exclude") {
          included = false;
        } else {
          included = validatedIncluded && !isExcludedPath(status.path);
        }
        return { ...status, included, forceInclude };
      }),
    );
  }, [
    files,
    userToggled,
    validations,
    isExcludedPath,
    userConfig.includePatterns,
    userConfig.ignorePatterns,
  ]);

  const toggleFileInclusion = useCallback(
    (index: number) => {
      const status = fileStatuses[index];
      if (!status) return;
      const target = !status.included;
      setUserToggled((prev) => {
        const next = { ...prev };
        if (target === patternDecision(status.path)) {
          delete next[status.path];
        } else {
          next[status.path] = target ? "include" : "exclude";
        }
        return next;
      });
    },
    [fileStatuses, patternDecision],
  );

  const toggleMultipleFiles = useCallback(
    (indices: number[], shouldInclude: boolean) => {
      setUserToggled((prev) => {
        const next = { ...prev };
        for (const i of indices) {
          const status = fileStatuses[i];
          if (!status) continue;
          if (shouldInclude === patternDecision(status.path)) {
            delete next[status.path];
          } else {
            next[status.path] = shouldInclude ? "include" : "exclude";
          }
        }
        return next;
      });
    },
    [fileStatuses, patternDecision],
  );

  const clearManualOverrides = useCallback(() => {
    setUserToggled({});
  }, []);

  const handleRepositorySubmit = useCallback(
    async (
      url: string,
      sourceType: SourceType,
      onProgress: (progress: DownloadProgress) => void,
      signal: AbortSignal,
    ) => {
      setIsRepoLoading(true);
      setSourceUrl(url);
      try {
        // Get adapter for source type
        const adapter = defaultSourceRegistry.getByType(sourceType);
        if (!adapter) {
          throw new Error("Unknown source type");
        }

        const { files, error } = await adapter.fetchFiles(url, {
          onProgress,
          signal,
        });

        if (error) {
          throw new Error(error);
        }

        const incomingFiles: Array<{ file: File; path: string; content?: string }> = [];

        for (const file of files) {
          if (signal.aborted) {
            throw new Error("Operation aborted");
          }

          const blob = new Blob([file.content || ""], { type: file.type });
          const fileObj = new File([blob], file.name, { type: file.type });

          incomingFiles.push({
            file: fileObj,
            path: file.path,
            content: file.content || "",
          });
        }

        await handleFilesBatch(incomingFiles);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Repository fetch aborted");
        }
        throw error;
      } finally {
        setIsRepoLoading(false);
      }
    },
    [handleFilesBatch],
  );

  const calculateChunks = useCallback(
    (contents: Array<{ path: string; content: string }>) => {
      const targetCharSize = maxFileSize * 1024; // Convert KB to bytes
      const chunks: (typeof contents)[] = [];
      let currentChunk: typeof contents = [];
      let currentSize = 0;

      // Process each file
      for (const file of contents) {
        const fileSize = new TextEncoder().encode(file.content).length; // Browser-safe size calculation

        // If adding this file would exceed the target size, start a new chunk
        if (currentSize + fileSize > targetCharSize && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentSize = 0;
        }

        // If a single file is larger than target size, split its content
        if (fileSize > targetCharSize) {
          const parts = Math.ceil(fileSize / targetCharSize);
          for (let i = 0; i < parts; i++) {
            const start = i * targetCharSize;
            const end = Math.min((i + 1) * targetCharSize, fileSize);
            chunks.push([
              {
                path: `${file.path} (part ${i + 1}/${parts})`,
                content: file.content.slice(start, end),
              },
            ]);
          }
        } else {
          currentChunk.push(file);
          currentSize += fileSize;
        }
      }

      // Add the last chunk if it has any files
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      return chunks;
    },
    [maxFileSize],
  );

  const generateOutput = useCallback(async () => {
    setIsProcessing(true);

    try {
      const includedContents = processedContents.filter((content) => {
        const status = fileStatuses.find((s) => s.path === content.path);
        return status?.included ?? false;
      });

      const tree = generateFileTree(includedContents.map((c) => c.path));
      const projectName = generateProjectName(includedContents.map((c) => c.path));
      const style = userConfig.outputStyle;
      const extension = style === "xml" ? "xml" : "md";
      const mimeType = style === "xml" ? "application/xml" : "text/markdown";

      const downloadBlob = (text: string, fileName: string) => {
        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      const source = sourceUrl ?? undefined;

      if (selectedFormat === "single") {
        const text = assembleOutput({
          projectName,
          files: includedContents,
          tree,
          style,
          source,
        });
        downloadBlob(text, `${projectName}_fileconcat.${extension}`);
      } else {
        const chunks = calculateChunks(includedContents);
        for (let i = 0; i < chunks.length; i++) {
          const text = assembleOutput({
            projectName,
            files: chunks[i],
            tree,
            style,
            source,
            part: { index: i + 1, total: chunks.length },
          });
          downloadBlob(text, `${projectName}-fileconcat-part${i + 1}.${extension}`);
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
    } catch (error) {
      console.error("Error generating output:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [
    selectedFormat,
    processedContents,
    calculateChunks,
    fileStatuses,
    userConfig.outputStyle,
    sourceUrl,
  ]);

  const copyToClipboard = useCallback(async () => {
    try {
      const includedContents = processedContents.filter((content) => {
        const status = fileStatuses.find((s) => s.path === content.path);
        return status?.included ?? false;
      });

      const tree = generateFileTree(includedContents.map((c) => c.path));
      const projectName = generateProjectName(includedContents.map((c) => c.path));

      const text = assembleOutput({
        projectName,
        files: includedContents,
        tree,
        style: userConfig.outputStyle,
        source: sourceUrl ?? undefined,
      });

      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [processedContents, fileStatuses, userConfig.outputStyle, sourceUrl]);

  const resetAll = useCallback(() => {
    sourceInputRef.current?.abort();
    setFiles([]);
    setFileStatuses([]);
    setValidations({});
    setUserToggled({});
    setIsProcessing(false);
    setIsRepoLoading(false);
    setTokens(0);
    setRawContents([]);
    setUserPickedFormat(null);
    setSourceUrl(null);
    setFailedFiles([]);
    setActiveFilePath(undefined);

    setMaxFileSize(32);
    sourceInputRef.current?.reset();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      resetAll();
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      setIsProcessing(true);
      setProcessingStatus("Scanning files...");

      const items = e.dataTransfer.items;
      const incomingFiles: Array<{ file: File; path: string }> = [];
      const failedFilesList: Array<{ path: string; error: string }> = [];

      const processEntry = async (entry: FileSystemEntry, path = ""): Promise<void> => {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          return new Promise((resolve) => {
            fileEntry.file(
              (file) => {
                const fullPath = path ? `${path}/${file.name}` : file.name;
                incomingFiles.push({ file, path: fullPath });
                resolve();
              },
              (error) => {
                const fullPath = path ? `${path}/${fileEntry.name}` : fileEntry.name;
                console.error(`Failed to access file ${fullPath}:`, error);
                failedFilesList.push({ path: fullPath, error: "File could not be read" });
                resolve();
              },
            );
          });
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          const newPath = path ? `${path}/${dirEntry.name}` : dirEntry.name;

          // The drop walk only hard-prunes directories that would crash the
          // browser (massive object trees). Everything else is loaded and the
          // filter rail decides what stays in the bundle, live.
          if (HARDCODED_PRUNE_DIRS.has(dirEntry.name)) {
            return Promise.resolve();
          }

          const dirReader = dirEntry.createReader();
          const readEntries = async (): Promise<FileSystemEntry[]> => {
            const entries: FileSystemEntry[] = [];
            let reading = true;
            while (reading) {
              await new Promise<void>((resolve) => {
                dirReader.readEntries((results) => {
                  if (results.length === 0) {
                    reading = false;
                  } else {
                    entries.push(...results);
                  }
                  resolve();
                });
              });
            }
            return entries;
          };

          return readEntries().then(async (entries) => {
            await Promise.all(entries.map((entry) => processEntry(entry, newPath)));
          });
        }

        return Promise.resolve();
      };

      try {
        const promises = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            promises.push(processEntry(entry));
          }
        }

        await Promise.all(promises);

        setProcessingStatus(`Processing ${incomingFiles.length} files...`);
        await handleFilesBatch(incomingFiles);

        // Update failed files from processEntry errors
        setFailedFiles((prev) => [...prev, ...failedFilesList]);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    },
    [resetAll, handleFilesBatch],
  );

  const getEstimations = useCallback(() => {
    // Filter processedContents to only include files that are currently marked as included
    const includedContents = processedContents.filter((content) => {
      const status = fileStatuses.find((s) => s.path === content.path);
      return status?.included ?? false;
    });

    const chunks = calculateChunks(includedContents);
    const chunkSizes = chunks.map((chunk) =>
      chunk.reduce((acc, file) => acc + new TextEncoder().encode(file.content).length, 0),
    );
    const avgSize =
      chunkSizes.length > 0
        ? Math.ceil(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length)
        : 0;

    const multiple = `${chunks.length} files, ~${formatSize(avgSize)} each`;

    // For single file option display
    const totalSize = includedContents.reduce(
      (acc, file) => acc + new TextEncoder().encode(file.content).length,
      0,
    );
    const single = `~${formatSize(totalSize)}`;

    return { single, multiple };
  }, [calculateChunks, processedContents, fileStatuses]);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      resetAll();
      setIsProcessing(true);

      try {
        const incomingFiles = Array.from(selectedFiles).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));

        await handleFilesBatch(incomingFiles);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        e.target.value = "";
        setIsProcessing(false);
      }
    },
    [resetAll, handleFilesBatch],
  );

  // Editing helpers
  const startEdit = useCallback(
    (path: string) => {
      const file = files.find((f) => f.path === path);
      if (!file) return;
      setEditingPath(path);
      setEditorDraftByPath((prev) => ({ ...prev, [path]: file.content }));
      setEditorDirtyByPath((prev) => ({ ...prev, [path]: false }));
    },
    [files],
  );

  const cancelEdit = useCallback((path: string) => {
    setEditingPath((prev) => (prev === path ? null : prev));
    setEditorDraftByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setEditorDirtyByPath((prev) => ({ ...prev, [path]: false }));
  }, []);

  const changeEdit = useCallback((path: string, value: string) => {
    setEditorDraftByPath((prev) => ({ ...prev, [path]: value }));
    setEditorDirtyByPath((prev) => ({ ...prev, [path]: true }));
  }, []);

  const saveEdit = useCallback(
    async (path: string) => {
      const draft = editorDraftByPath[path];
      if (draft == null) return;

      // Update files
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: draft } : f)));

      // Update file size in statuses
      const byteLen = new TextEncoder().encode(draft).length;
      setFileStatuses((prev) => prev.map((s) => (s.path === path ? { ...s, size: byteLen } : s)));

      // Recompute processedContents based on inclusion
      const includedSet = new Set(
        fileStatuses
          .map((s) => (s.path === path ? { ...s, size: byteLen } : s))
          .filter((s) => s.included)
          .map((s) => s.path),
      );

      const newFiles = files.map((f) => (f.path === path ? { ...f, content: draft } : f));
      const newProcessed = newFiles
        .filter((f) => includedSet.has(f.path))
        .map((f) => ({ path: f.path, content: f.content }));
      setRawContents(newProcessed);

      // Re-estimate tokens for included content
      try {
        await estimateTokens(newProcessed.map((c) => c.content).join("\n"));
      } catch (e) {
        console.warn("Token estimation failed after save", e);
      }

      // Clear edit state
      setEditorDirtyByPath((prev) => ({ ...prev, [path]: false }));
      setEditingPath((prev) => (prev === path ? null : prev));
      setEditorDraftByPath((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    },
    [editorDraftByPath, files, fileStatuses, estimateTokens],
  );

  // Warn on page unload if there are unsaved changes
  useEffect(() => {
    const hasDirty = Object.values(editorDirtyByPath).some(Boolean);
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editorDirtyByPath]);

  const includedFileCount = fileStatuses.filter((s) => s.included).length;
  const manualOverrideCount = Object.keys(userToggled).length;
  const hasFiles = fileStatuses.length > 0;

  const projectName = useMemo(() => {
    if (files.length === 0) return "";
    return generateProjectName(files.map((f) => f.path));
  }, [files]);

  const sourceStatusMessage = (() => {
    if (isProcessing) return processingStatus || "Generating bundle…";
    if (isRepoLoading) return "Fetching repository…";
    if (!hasFiles) return "";
    return `${tokens.toLocaleString()} tokens`;
  })();

  const filterRailProps = {
    config: userConfig,
    setConfig,
    exportConfig,
    importConfig,
    resetConfig,
    totalFiles: fileStatuses.length,
    includedFiles: includedFileCount,
    manualOverrideCount,
    onClearOverrides: clearManualOverrides,
    hasFiles,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      {hasFiles && (
        <SourceBar
          projectName={projectName}
          fileCount={fileStatuses.length}
          includedCount={includedFileCount}
          manualOverrideCount={manualOverrideCount}
          isProcessing={isProcessing || isRepoLoading}
          statusMessage={sourceStatusMessage}
          onReset={resetAll}
          onOpenFilters={() => setIsMobileFiltersOpen(true)}
        />
      )}

      {failedFiles.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            <div className="font-medium text-red-600">
              Failed to read {failedFiles.length} file{failedFiles.length > 1 ? "s" : ""}:
            </div>
            <ul className="mt-2 list-inside list-disc text-sm">
              {failedFiles.slice(0, 5).map((failed, index) => (
                <li key={index} className="truncate text-red-600">
                  {failed.path}
                </li>
              ))}
              {failedFiles.length > 5 && (
                <li className="text-muted-foreground">... and {failedFiles.length - 5} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!hasFiles && (
        <div className="mx-auto max-w-2xl">
          <SourceInput
            ref={sourceInputRef}
            isLoading={isRepoLoading}
            onSubmit={handleRepositorySubmit}
            config={userConfig}
          />

          <div className="text-muted-foreground my-4 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.08em]">
            <span className="border-border/60 h-px flex-1 border-t" aria-hidden="true" />
            or drop
            <span className="border-border/60 h-px flex-1 border-t" aria-hidden="true" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isProcessing || isRepoLoading}
          />
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isProcessing || isRepoLoading}
          />

          <div
            onDragEnter={isProcessing || isRepoLoading ? undefined : handleDragEnter}
            onDragLeave={isProcessing || isRepoLoading ? undefined : handleDragLeave}
            onDragOver={isProcessing || isRepoLoading ? undefined : handleDragOver}
            onDrop={isProcessing || isRepoLoading ? undefined : handleDrop}
            className={`border-border/70 mb-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-200 ${
              isProcessing || isRepoLoading
                ? "cursor-not-allowed opacity-50"
                : isDragging
                  ? "border-foreground bg-muted/40"
                  : "hover:border-foreground/40"
            }`}
          >
            <Upload
              className={`mx-auto mb-4 h-10 w-10 transition-colors duration-200 ${
                isProcessing || isRepoLoading
                  ? "text-muted-foreground/40"
                  : isDragging
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            />
            <p className="text-foreground text-sm">
              {isProcessing
                ? processingStatus || "Processing files..."
                : isDragging
                  ? "Drop files here"
                  : "Drag a folder or files here"}
            </p>
            {!isProcessing && !isRepoLoading && (
              <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || isRepoLoading}
                >
                  Browse files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isProcessing || isRepoLoading}
                >
                  Browse folder
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {hasFiles && (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <FilterRail {...filterRailProps} />
          </div>

          <div className="min-w-0 space-y-6">
            <FileTree
              fileStatuses={fileStatuses}
              onToggleFile={toggleFileInclusion}
              onToggleMultipleFiles={toggleMultipleFiles}
              isProcessing={isProcessing}
              onOpenFile={(path) => setActiveFilePath(path)}
            />

            {activeFilePath &&
              (() => {
                const f = files.find((f) => f.path === activeFilePath);
                const s = fileStatuses.find((s) => s.path === activeFilePath);
                if (!f || !s) return null;
                const isEditing = editingPath === activeFilePath;
                const onToggleInclude = () => {
                  const idx = fileStatuses.findIndex((st) => st.path === activeFilePath);
                  if (idx >= 0) toggleFileInclusion(idx);
                };
                return (
                  <FileViewerModal
                    open={!!activeFilePath}
                    onOpenChange={(open) => {
                      if (!open) {
                        if (editorDirtyByPath[f.path]) {
                          const proceed = window.confirm("Discard unsaved changes?");
                          if (!proceed) return;
                          cancelEdit(f.path);
                        }
                        setActiveFilePath(undefined);
                      } else {
                        setActiveFilePath(activeFilePath);
                      }
                    }}
                    path={f.path}
                    size={s.size}
                    included={s.included}
                    reason={s.reason}
                    content={(isEditing ? editorDraftByPath[f.path] : f.content) ?? null}
                    onToggleInclude={onToggleInclude}
                    isProcessing={isProcessing}
                    editingEnabled={isEditorEnabled}
                    isEditing={isEditing}
                    isDirty={!!editorDirtyByPath[f.path]}
                    onStartEdit={() => startEdit(f.path)}
                    onCancelEdit={() => cancelEdit(f.path)}
                    onSaveEdit={() => saveEdit(f.path)}
                    onChangeEdit={(val: string) => changeEdit(f.path, val)}
                  />
                );
              })()}

            {tokens > 0 && <TokenSection tokens={tokens} />}
          </div>
        </div>
      )}

      {hasFiles && processedContents.length > 0 && (
        <ActionBar
          tokens={tokens}
          format={selectedFormat}
          style={userConfig.outputStyle}
          recommendedFormat={recommendedFormat}
          maxFileSizeMB={maxFileSize}
          estimations={getEstimations()}
          isProcessing={isProcessing}
          canEmit={includedFileCount > 0}
          isCopied={isCopied}
          onSelectFormat={(format) => setUserPickedFormat(format)}
          onSelectStyle={(style) => setConfig({ outputStyle: style })}
          onChangeMaxFileSize={setMaxFileSize}
          onCopy={copyToClipboard}
          onDownload={generateOutput}
        />
      )}

      {/* Mobile filter drawer. Below lg the rail collapses into this sheet. */}
      <Dialog open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
        <DialogContent
          unstyled
          className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left border-border/60 fixed inset-y-0 left-0 top-0 z-50 m-0 flex h-full w-full max-w-[340px] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-r p-5 shadow-lg sm:rounded-none"
        >
          <DialogTitle className="mb-4 text-sm font-semibold">Filters</DialogTitle>
          <FilterRail {...filterRailProps} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default App;
