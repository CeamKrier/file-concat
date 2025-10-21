import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Shield, Trash2 } from "lucide-react";
import { SiGithub, SiX } from "@icons-pack/react-simple-icons";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RepositoryInput, { RepositoryInputRef } from "./components/repository-input";
import { ThemeToggle } from "@/components/theme-toggle";
import OutputSettings from "@/components/output-settings";
import TokenInfoPopover from "@/components/token-info-popover";
import PreviewModal from "@/components/preview-modal";
import FileTree from "@/components/file-tree";
import FileViewerModal from "@/components/file-viewer-modal";
import AboutSection from "@/components/about-section";

import { DownloadProgress, FileEntry, FileStatus, OutputFormat, ProcessingConfig } from "@/types";
import {
  validateFile,
  formatSize,
  estimateTokenCount,
  fetchRepositoryFiles,
  shouldSkipPath,
  calculateTotalSize,
} from "@/utils";
import { LLM_CONTEXT_LIMITS, MULTI_OUTPUT_LIMIT, DEFAULT_CONFIG } from "@/constants";

import BMCLogo from "./components/bmc-logo";

const App: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [output, setOutput] = useState<string>("");
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRepoLoading, setIsRepoLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [tokens, setTokens] = useState<number>(0);
  const [processedContents, setProcessedContents] = useState<
    Array<{ path: string; content: string }>
  >([]);
  const [recommendedFormat, setRecommendedFormat] = useState<OutputFormat>("single");
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat | undefined>();
  const [config] = useState<ProcessingConfig>(DEFAULT_CONFIG);

  const [maxFileSize, setMaxFileSize] = useState<number>(32);

  // Viewer state
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);
  const [isEditorEnabled] = useState<boolean>(true); // feature flag (can be wired to a UI toggle later)
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorDirtyByPath, setEditorDirtyByPath] = useState<Record<string, boolean>>({});
  const [editorDraftByPath, setEditorDraftByPath] = useState<Record<string, string>>({});
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  // Track responsive breakpoint to decide between pane vs modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)"); // Tailwind md breakpoint
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsDesktop("matches" in e ? e.matches : (e as MediaQueryList).matches);
    // Initialize
    setIsDesktop(mql.matches);
    // Listen
    const onChange = (e: MediaQueryListEvent) => handler(e);
    mql.addEventListener?.("change", onChange);
    return () => {
      mql.removeEventListener?.("change", onChange);
    };
  }, []);

  const dragCounter = useRef<number>(0);
  const repositoryInputRef = useRef<RepositoryInputRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tokens > MULTI_OUTPUT_LIMIT) {
      setRecommendedFormat("multi");
    } else {
      setRecommendedFormat("single");
    }
  }, [tokens]);

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

  const isExcludedPath = useCallback((path: string) => {
    if (shouldSkipPath(path)) {
      console.log(`Skipping excluded path: ${path}`);
      return true;
    }
    return false;
  }, []);

  const handleFilesBatch = useCallback(
    async (incomingFiles: Array<{ file: File; path?: string; content?: string }>) => {
      const normalizedEntries = incomingFiles
        .map((entry) => {
          const path = entry.path || entry.file.webkitRelativePath || entry.file.name;
          return { ...entry, path };
        })
        .filter((entry) => {
          return !isExcludedPath(entry.path);
        });

      const statuses: FileStatus[] = [];
      const newFileEntries: FileEntry[] = [];
      const includedContents: Array<{ path: string; content: string }> = [];

      for (const entry of normalizedEntries) {
        const index = statuses.length;
        const status = await processFile(entry.file, entry.path, index);
        statuses.push(status);

        const content = entry.content !== undefined ? entry.content : await entry.file.text();
        const fileEntry: FileEntry = {
          file: entry.file,
          path: entry.path,
          content,
        };

        newFileEntries.push(fileEntry);

        if (status.included) {
          includedContents.push({ path: fileEntry.path, content: fileEntry.content });
        }
      }

      setFiles(newFileEntries);
      setFileStatuses(statuses);
      setProcessedContents(includedContents);

      if (includedContents.length > 0) {
        await estimateTokens(includedContents.map((c) => c.content).join("\n"));
      } else {
        setTokens(0);
      }
    },
    [estimateTokens, isExcludedPath, processFile],
  );

  const toggleFileInclusion = useCallback(
    async (index: number) => {
      try {
        // Create new statuses array with toggled status
        const newStatuses = fileStatuses.map((status, i) =>
          i === index
            ? { ...status, included: !status.included, forceInclude: !status.included }
            : status,
        );
        setFileStatuses(newStatuses);

        // Use the new statuses to filter files
        const includedFiles = files.filter((_, i) => newStatuses[i].included);

        // Process the files - handle both repository and drag-dropped files
        const contents = await Promise.all(
          includedFiles.map(async (fileEntry) => {
            if (fileEntry.content) {
              // Repository file
              return {
                path: fileEntry.path,
                content: fileEntry.content,
              };
            } else {
              // Drag-dropped file
              return {
                path: fileEntry.path,
                content: fileEntry.content,
              };
            }
          }),
        );

        estimateTokens(contents.map((c) => c.content).join("\n"));

        // Update state
        setProcessedContents(contents);
      } catch (error) {
        console.error("Error reprocessing files:", error);
      }
    },
    [files, fileStatuses, estimateTokens],
  );

  const toggleMultipleFiles = useCallback(
    async (indices: number[], shouldInclude: boolean) => {
      try {
        // Create new statuses array with toggled statuses for multiple files
        const newStatuses = fileStatuses.map((status, i) => {
          if (indices.includes(i)) {
            return { ...status, included: shouldInclude, forceInclude: shouldInclude };
          }
          return status;
        });
        setFileStatuses(newStatuses);

        // Use the new statuses to filter files
        const includedFiles = files.filter((_, i) => newStatuses[i].included);

        // Process the files - handle both repository and drag-dropped files
        const contents = await Promise.all(
          includedFiles.map(async (fileEntry) => {
            if (fileEntry.content) {
              // Repository file
              return {
                path: fileEntry.path,
                content: fileEntry.content,
              };
            } else {
              // Drag-dropped file
              return {
                path: fileEntry.path,
                content: fileEntry.content,
              };
            }
          }),
        );

        estimateTokens(contents.map((c) => c.content).join("\n"));

        // Update state
        setProcessedContents(contents);
      } catch (error) {
        console.error("Error reprocessing files:", error);
      }
    },
    [files, fileStatuses, estimateTokens],
  );

  const handleRepositorySubmit = useCallback(
    async (url: string, onProgress: (progress: DownloadProgress) => void, signal: AbortSignal) => {
      setIsRepoLoading(true);
      try {
        const { files, error } = await fetchRepositoryFiles(url, onProgress, signal);

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
      // Filter processedContents to only include files that are currently marked as included
      const includedContents = processedContents.filter((content) => {
        const status = fileStatuses.find((s) => s.path === content.path);
        return status?.included ?? false;
      });

      if (selectedFormat === "single") {
        const output =
          `# Files\n` +
          includedContents
            .map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`)
            .join("\n");

        const blob = new Blob([output], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "concat-output.md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const chunks = calculateChunks(includedContents);

        // Process and download chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const output =
            `# Files - Part ${i + 1}/${chunks.length}\n` +
            chunk.map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`).join("\n");

          const blob = new Blob([output], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `concat-output-part${i + 1}.md`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          // Small delay between downloads
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
  }, [selectedFormat, processedContents, calculateChunks, fileStatuses]);

  const resetAll = useCallback(() => {
    repositoryInputRef.current?.abort();
    setFiles([]);
    setOutput("");
    setFileStatuses([]);
    setIsProcessing(false);
    setIsRepoLoading(false);
    setTokens(0);
    setProcessedContents([]);
    setSelectedFormat(undefined);

    setMaxFileSize(32);
    repositoryInputRef.current?.reset();
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

      const items = e.dataTransfer.items;
      const incomingFiles: Array<{ file: File; path: string }> = [];

      const processEntry = async (entry: FileSystemEntry, path = ""): Promise<void> => {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          return new Promise((resolve) => {
            fileEntry.file((file) => {
              const fullPath = path ? `${path}/${file.name}` : file.name;

              if (!isExcludedPath(fullPath)) {
                incomingFiles.push({ file, path: fullPath });
              }

              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          const newPath = path ? `${path}/${dirEntry.name}` : dirEntry.name;

          if (isExcludedPath(`${newPath}/`)) {
            return Promise.resolve();
          }

          const dirReader = dirEntry.createReader();
          return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
              await Promise.all(entries.map((entry) => processEntry(entry, newPath)));
              resolve();
            });
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
        await handleFilesBatch(incomingFiles);
      } catch (error) {
        console.error("Error processing files:", error);
      } finally {
        setIsProcessing(false);
      }
    },
    [resetAll, handleFilesBatch, isExcludedPath],
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

  const generatePreview = useCallback(() => {
    // Filter processedContents to only include files that are currently marked as included
    const includedContents = processedContents.filter((content) => {
      const status = fileStatuses.find((s) => s.path === content.path);
      return status?.included ?? false;
    });

    if (selectedFormat === "single") {
      return [
        {
          name: "concat-output.md",
          content:
            `# Files\n` +
            includedContents
              .map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`)
              .join("\n"),
        },
      ];
    } else {
      const chunks = calculateChunks(includedContents);
      return chunks.map((chunk, i) => ({
        name: `concat-output-part${i + 1}.md`,
        content:
          `# Files - Part ${i + 1}/${chunks.length}\n` +
          chunk.map(({ path, content }) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`).join("\n"),
      }));
    }
  }, [selectedFormat, processedContents, calculateChunks, fileStatuses]);

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
      setProcessedContents(newProcessed);

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

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="mb-2 flex items-center gap-2">
                <img src="/logo.png" alt="Logo" className="h-8 w-8 dark:hidden" />
                <img src="/dark-logo.png" alt="Logo" className="hidden h-8 w-8 dark:block" />
                File Concat Tool
              </CardTitle>
              <CardDescription className="max-w-xl text-sm">
                Combine multiple files and folders into a single, well-formatted document optimized
                for Large Language Models (LLMs). Perfect for sharing codebases, documentation, and
                project structures with AI assistants like ChatGPT, Claude, and others.
              </CardDescription>
            </div>
            <div className="flex items-start gap-2">
              <ThemeToggle />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 rounded-md border border-green-200 bg-muted px-1.5 py-1.5 text-sm text-green-600">
                  <Shield className="h-4 w-4 fill-current" />
                  100% Offline Processing
                </div>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-sm text-muted-foreground">Got feedback?</span>
                  <Button variant="ghost" asChild className="w-fit" size="sm">
                    <a
                      className="w-fit"
                      href="https://twitter.com/messages/compose?recipient_id=378117341"
                      target="_blank"
                    >
                      <SiX className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" asChild className="w-fit" size="sm">
                    <a
                      className="w-fit"
                      href="https://github.com/CeamKrier/file-concat"
                      target="_blank"
                    >
                      <SiGithub className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <div className="flex items-center justify-center">
                  <a
                    className="flex items-center gap-2 underline-offset-2 hover:underline"
                    href="https://buymeacoffee.com/ceamkrier"
                    target="_blank"
                    rel="noopener"
                  >
                    <BMCLogo />
                    <span className="text-xs text-muted-foreground">Support me</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!fileStatuses.length && (
            <>
              <RepositoryInput
                ref={repositoryInputRef}
                isLoading={isRepoLoading}
                onSubmit={handleRepositorySubmit}
              />

              <div className="flex items-center justify-center py-4">or</div>

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
                className={`mb-4 rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200 ${isProcessing || isRepoLoading ? "cursor-not-allowed border-gray-200 opacity-50" : isDragging ? "border-blue-500 bg-muted" : "hover:border-blue-300"} `}
              >
                <Upload
                  className={`mx-auto mb-4 h-12 w-12 transition-colors duration-200 ${isProcessing || isRepoLoading ? "text-gray-300" : isDragging ? "text-blue-500" : "text-gray-400"}`}
                />
                <p>
                  {isProcessing
                    ? "Processing files..."
                    : isDragging
                      ? "Drop files here"
                      : "Drag and drop files or folders here"}
                </p>
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  or
                </div>
                {!isProcessing && !isRepoLoading && (
                  <div className="flex justify-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || isRepoLoading}
                    >
                      Browse Files
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => folderInputRef.current?.click()}
                      disabled={isProcessing || isRepoLoading}
                    >
                      Browse Folder
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {(files.length > 0 || output) && (
            <button
              onClick={resetAll}
              className="flex w-full items-center justify-center gap-2 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Start Over
            </button>
          )}

          {fileStatuses.length > 0 && (
            <div className="mb-4 mt-4">
              {/* Responsive layout: single column on mobile, two columns on desktop when a file is active */}
              <div
                className={
                  activeFilePath && isDesktop ? "grid grid-cols-1 gap-4 md:grid-cols-2" : ""
                }
              >
                <div>
                  <FileTree
                    fileStatuses={fileStatuses}
                    onToggleFile={toggleFileInclusion}
                    onToggleMultipleFiles={toggleMultipleFiles}
                    isProcessing={isProcessing}
                    onOpenFile={(path) => setActiveFilePath(path)}
                  />
                </div>
              </div>

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
            </div>
          )}

          {tokens > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Tokenization</h3>
                  <TokenInfoPopover />
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Estimated tokens: {tokens.toLocaleString()}
                  </div>
                </div>
              </div>

              {LLM_CONTEXT_LIMITS.map((llm) => {
                const percentage = (tokens / llm.limit) * 100;

                if (percentage > 100) {
                  return null; // Skip LLMs that are over the limit, except for Custom
                }

                return (
                  <div key={llm.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        <span className="font-bold">{llm.name}</span> -{" "}
                        <span className="text-muted-foreground">
                          {llm.limit.toLocaleString()} tokens
                        </span>
                      </span>
                      <span className={percentage > 100 ? "text-red-500" : "text-muted-foreground"}>
                        {percentage.toFixed(1)}% used
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className={`h-2 rounded-full ${percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {processedContents.length > 0 && (
            <div className="mt-6 space-y-6">
              <h3 className="font-semibold">Output Format</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSelectedFormat("single")}
                  className={`rounded-lg border-2 p-4 transition-all ${selectedFormat === "single" ? "border-blue-500 bg-secondary" : "border-gray-200 hover:border-blue-300"}`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-semibold">Single File</h3>
                    {recommendedFormat === "single" && (
                      <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    All content in one file. Best for smaller contexts.
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {getEstimations().single}
                  </div>
                </button>

                <button
                  onClick={() => setSelectedFormat("multi")}
                  className={`rounded-lg border-2 p-4 transition-all ${selectedFormat === "multi" ? "border-blue-500 bg-secondary" : "border-gray-200 hover:border-blue-300"}`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-semibold">Multiple Files</h3>
                    {recommendedFormat === "multi" && (
                      <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Split into optimal chunks. Better for large contexts.
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {getEstimations().multiple}
                  </div>
                </button>
              </div>

              {selectedFormat === "multi" && (
                <OutputSettings
                  maxFileSize={maxFileSize}
                  setMaxFileSize={setMaxFileSize}
                  disabled={isProcessing}
                />
              )}

              <div className="flex gap-2">
                {/* <button
                                    onClick={() => setIsPreviewOpen(true)}
                                    disabled={!selectedFormat || isProcessing}
                                    className='flex-1 justify-center px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'>
                                    <Eye className='w-4 h-4' />
                                    Preview
                                </button> */}
                <button
                  onClick={generateOutput}
                  disabled={!selectedFormat || isProcessing}
                  className="flex flex-1 items-center justify-center gap-2 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>

              <PreviewModal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                files={generatePreview()}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AboutSection />
    </div>
  );
};

export default App;
