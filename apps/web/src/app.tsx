import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import SourceInput, { type SourceInputSubmitHandler } from "~/components/source-input";
import { TokenSection } from "~/components/token-section";
import FileTree from "~/components/file-tree";
import FileViewerModal from "~/components/file-viewer-modal";
import { FilterRail } from "~/components/filter-rail";
import { SourceBar } from "~/components/source-bar";
import { ActionBar } from "~/components/action-bar";
import { useStagedFiles } from "~/components/staged-files-provider";

import { useConfig } from "~/hooks/use-config";
import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { useFilterState } from "~/hooks/use-filter-state";
import { useFileEditor } from "~/hooks/use-file-editor";
import { useOutputGeneration } from "~/hooks/use-output-generation";

import { DEFAULT_CONFIG, addLineNumbers, generateProjectName } from "@fileconcat/core";
import { estimateTokenCount, preloadTokenEstimator } from "~/lib/tokens";

const App: React.FC = () => {
  const { config: userConfig, setConfig, exportConfig, importConfig, resetConfig } = useConfig();

  const ingestion = useFileIngestion(DEFAULT_CONFIG);
  const filter = useFilterState({
    entries: ingestion.entries,
    validations: ingestion.validations,
    includePatterns: userConfig.includePatterns,
    ignorePatterns: userConfig.ignorePatterns,
  });
  const editor = useFileEditor(ingestion.entries, ingestion.setEntryContent);

  // Single derivation: filter to "included" set, optionally apply line numbers.
  const includedContents = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    const transform = userConfig.showLineNumbers ? addLineNumbers : null;
    return ingestion.entries
      .filter((e) => included.has(e.path))
      .map((e) => ({ path: e.path, content: transform ? transform(e.content) : e.content }));
  }, [ingestion.entries, filter.fileStatuses, userConfig.showLineNumbers]);

  // Tiktoken's WASM encoder is loaded lazily on the client (kept out of the
  // SSR worker bundle to stay under Cloudflare's worker size limit). Until it
  // resolves, estimateTokenCount returns a bytes/4 approximation; flipping
  // estimatorReady triggers a recompute with the exact count.
  const [estimatorReady, setEstimatorReady] = useState(false);
  useEffect(() => {
    void preloadTokenEstimator().then(() => setEstimatorReady(true));
  }, []);

  const tokens = useMemo(() => {
    if (includedContents.length === 0) return 0;
    const combined = includedContents.map((c) => c.content).join("\n");
    return estimateTokenCount(combined);
  }, [includedContents, estimatorReady]);

  const output = useOutputGeneration({
    includedContents,
    tokens,
    sourceUrl: ingestion.sourceUrl,
    outputStyle: userConfig.outputStyle,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);

  // Sibling state to clear on a fresh ingest. Ingestion overwrites its own
  // entries/validations/failedFiles when a batch lands, so it does not need
  // explicit clearing here.
  const resetSiblings = useCallback(() => {
    filter.reset();
    editor.cancel();
    output.reset();
  }, [filter, editor, output]);

  const resetAll = useCallback(() => {
    ingestion.reset();
    resetSiblings();
    setActiveFilePath(undefined);
  }, [ingestion, resetSiblings]);

  const handleRepositorySubmit = useCallback<SourceInputSubmitHandler>(
    async (url, sourceType, onProgress, signal) => {
      resetSiblings();
      await ingestion.ingestRepo(url, sourceType, onProgress, signal);
    },
    [resetSiblings, ingestion],
  );

  const onFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      resetSiblings();
      await ingestion.handleFileInput(e);
    },
    [resetSiblings, ingestion],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      resetSiblings();
      await ingestion.handleDrop(e);
    },
    [resetSiblings, ingestion],
  );

  // Staged-files hydration (landing → /app).
  const { consume: consumeStagedFiles } = useStagedFiles();
  const stagedHydratedRef = useRef(false);
  useEffect(() => {
    if (stagedHydratedRef.current) return;
    const staged = consumeStagedFiles();
    if (!staged || staged.length === 0) return;
    stagedHydratedRef.current = true;
    resetSiblings();
    ingestion.ingestBatch(staged.map(({ file, path, content }) => ({ file, path, content })));
  }, [consumeStagedFiles, resetSiblings, ingestion]);

  const projectName = useMemo(() => {
    if (ingestion.entries.length === 0) return "";
    return generateProjectName(ingestion.entries.map((e) => e.path));
  }, [ingestion.entries]);

  const hasFiles = filter.hasFiles;
  const isBusy = ingestion.isProcessing || ingestion.isRepoLoading || output.isGenerating;

  const sourceStatusMessage = (() => {
    if (ingestion.isProcessing) return ingestion.processingStatus || "Generating bundle…";
    if (ingestion.isRepoLoading) return "Fetching repository…";
    if (output.isGenerating) return "Generating bundle…";
    if (!hasFiles) return "";
    return `${tokens.toLocaleString()} tokens`;
  })();

  const filterRailProps = {
    config: userConfig,
    setConfig,
    exportConfig,
    importConfig,
    resetConfig,
    totalFiles: filter.fileStatuses.length,
    includedFiles: filter.includedFileCount,
    manualOverrideCount: filter.manualOverrideCount,
    onClearOverrides: filter.clearOverrides,
    hasFiles,
  };

  const activeFile = activeFilePath
    ? ingestion.entries.find((e) => e.path === activeFilePath)
    : undefined;
  const activeStatus = activeFilePath
    ? filter.fileStatuses.find((s) => s.path === activeFilePath)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      {hasFiles && (
        <SourceBar
          projectName={projectName}
          fileCount={filter.fileStatuses.length}
          includedCount={filter.includedFileCount}
          manualOverrideCount={filter.manualOverrideCount}
          isProcessing={isBusy}
          statusMessage={sourceStatusMessage}
          onReset={resetAll}
          onOpenFilters={() => setIsMobileFiltersOpen(true)}
        />
      )}

      {ingestion.failedFiles.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            <div className="font-medium text-red-600">
              Failed to read {ingestion.failedFiles.length} file
              {ingestion.failedFiles.length > 1 ? "s" : ""}:
            </div>
            <ul className="mt-2 list-inside list-disc text-sm">
              {ingestion.failedFiles.slice(0, 5).map((failed, index) => (
                <li key={index} className="truncate text-red-600">
                  {failed.path}
                </li>
              ))}
              {ingestion.failedFiles.length > 5 && (
                <li className="text-muted-foreground">
                  ... and {ingestion.failedFiles.length - 5} more
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!hasFiles && (
        <div className="mx-auto max-w-2xl">
          <SourceInput
            isLoading={ingestion.isRepoLoading}
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
            onChange={onFileInput}
            className="hidden"
            disabled={isBusy}
          />
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={onFileInput}
            className="hidden"
            disabled={isBusy}
          />

          <div
            onDragEnter={isBusy ? undefined : ingestion.handleDragEnter}
            onDragLeave={isBusy ? undefined : ingestion.handleDragLeave}
            onDragOver={isBusy ? undefined : ingestion.handleDragOver}
            onDrop={isBusy ? undefined : onDrop}
            className={`border-border/70 mb-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-200 ${
              isBusy
                ? "cursor-not-allowed opacity-50"
                : ingestion.isDragging
                  ? "border-foreground bg-muted/40"
                  : "hover:border-foreground/40"
            }`}
          >
            <Upload
              className={`mx-auto mb-4 h-10 w-10 transition-colors duration-200 ${
                isBusy
                  ? "text-muted-foreground/40"
                  : ingestion.isDragging
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            />
            <p className="text-foreground text-sm">
              {ingestion.isProcessing
                ? ingestion.processingStatus || "Processing files..."
                : ingestion.isDragging
                  ? "Drop files here"
                  : "Drag a folder or files here"}
            </p>
            {!isBusy && (
              <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  Browse files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isBusy}
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
              fileStatuses={filter.fileStatuses}
              onToggleFile={filter.toggleFile}
              onToggleMultipleFiles={filter.toggleMany}
              isProcessing={isBusy}
              onOpenFile={(path) => setActiveFilePath(path)}
            />

            {activeFile && activeStatus && (
              <FileViewerModal
                open={!!activeFilePath}
                onOpenChange={(open) => {
                  if (open) return;
                  if (editor.isDirty(activeFile.path)) {
                    const proceed = window.confirm("Discard unsaved changes?");
                    if (!proceed) return;
                    editor.cancel();
                  }
                  setActiveFilePath(undefined);
                }}
                path={activeFile.path}
                size={activeStatus.size}
                included={activeStatus.included}
                reason={activeStatus.reason}
                content={editor.draftFor(activeFile.path) ?? activeFile.content}
                onToggleInclude={() => filter.toggleFile(activeStatus.index)}
                isProcessing={isBusy}
                editingEnabled
                isEditing={editor.isEditing(activeFile.path)}
                isDirty={editor.isDirty(activeFile.path)}
                onStartEdit={() => editor.start(activeFile.path)}
                onCancelEdit={() => editor.cancel()}
                onSaveEdit={() => editor.save()}
                onChangeEdit={(value: string) => editor.change(value)}
              />
            )}

            {tokens > 0 && (
              <TokenSection
                tokens={tokens}
                selectedFormat={output.selectedFormat}
                onSwitchToMultipart={() => output.setUserPickedFormat("multi")}
              />
            )}
          </div>
        </div>
      )}

      {hasFiles && includedContents.length > 0 && (
        <ActionBar
          tokens={tokens}
          format={output.selectedFormat}
          style={userConfig.outputStyle}
          recommendedFormat={output.recommendedFormat}
          chunkSizeKB={output.chunkSizeKB}
          estimations={output.estimations}
          isProcessing={isBusy}
          canEmit={output.canEmit}
          isCopied={output.isCopied}
          onSelectFormat={output.setUserPickedFormat}
          onSelectStyle={(style) => setConfig({ outputStyle: style })}
          onChangeChunkSize={output.setChunkSizeKB}
          onCopy={output.copy}
          onDownload={output.download}
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
