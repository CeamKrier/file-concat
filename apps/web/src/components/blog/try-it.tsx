import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, RotateCcw } from "lucide-react";
import {
  DEFAULT_CONFIG,
  DEFAULT_IGNORE_STRING,
  assembleOutput,
  generateFileTree,
  generateProjectName,
  summarizeExclusions,
} from "@fileconcat/core";

import { DropZone } from "~/components/app/drop-zone";
import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { useFilterState } from "~/hooks/use-filter-state";
import { estimateTokenCount, preloadTokenEstimator } from "~/lib/tokens";

type Phase = "idle" | "processing" | "result";

/**
 * The inline "now do it with your files" moment. A real, contained slice of the
 * tool: drop files or a folder and it runs the same ingestion + default noise
 * filtering + assembly engine right here, then hands back a copyable bundle and
 * a live token count. Everything runs in the browser, nothing is uploaded to us.
 * Filtering, imports, and per-file control live in the full tool, reachable from
 * the site header. This card never navigates away, so a drop is never discarded:
 * the full tool starts fresh and can't receive this inline state, so linking to
 * it from here would throw the user's files away.
 *
 * Default-exported so the blog MDX provider can lazy-load it: the engine and its
 * dependencies never enter the docs or the article's first chunk.
 */
export default function TryIt({
  title = "Try it with your own files",
  hint = "Drop a folder or a few files. It runs here in your browser, nothing is uploaded.",
}: {
  title?: string;
  hint?: string;
}) {
  const ingestion = useFileIngestion(DEFAULT_CONFIG);
  const filter = useFilterState({
    entries: ingestion.entries,
    validations: ingestion.validations,
    // The tool's default filtering: no include narrowing, the curated noise
    // floor subtracting. Mirrors use-config's DEFAULT_CONFIG so the inline demo
    // matches what the full tool does out of the box.
    includePatterns: "",
    ignorePatterns: DEFAULT_IGNORE_STRING,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [copied, setCopied] = useState(false);
  const [estimatorReady, setEstimatorReady] = useState(false);

  useEffect(() => {
    void preloadTokenEstimator().then(() => setEstimatorReady(true));
  }, []);

  const includedContents = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    return ingestion.entries
      .filter((e) => included.has(e.path))
      .map((e) => ({ path: e.path, content: e.content }));
  }, [ingestion.entries, filter.fileStatuses]);

  const tokens = useMemo(() => {
    if (includedContents.length === 0) return 0;
    return estimateTokenCount(includedContents.map((c) => c.content).join("\n"));
    // estimatorReady retriggers the estimate once tiktoken finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedContents, estimatorReady]);

  const previewText = useMemo(() => {
    if (includedContents.length === 0) return "";
    const paths = includedContents.map((f) => f.path);
    return assembleOutput({
      projectName: generateProjectName(paths),
      files: includedContents,
      tree: generateFileTree(paths),
      style: "xml",
      excluded: summarizeExclusions(filter.fileStatuses),
    });
  }, [includedContents, filter.fileStatuses]);

  const filesCombined = filter.includedFileCount;

  const runDrop = useCallback(
    async (run: () => Promise<void>) => {
      setCopied(false);
      setPhase("processing");
      await run();
      setPhase("result");
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => void runDrop(() => ingestion.handleDrop(e)),
    [runDrop, ingestion],
  );
  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => void runDrop(() => ingestion.handleFileInput(e)),
    [runDrop, ingestion],
  );

  const startOver = useCallback(() => {
    ingestion.reset();
    filter.reset();
    setPhase("idle");
    setCopied(false);
  }, [ingestion, filter]);

  const copy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(previewText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [previewText]);

  const progress = ingestion.progress;
  const heading = progress?.note ?? "Reading your files";
  const detail =
    progress && progress.total > 0 ? `${progress.done} / ${progress.total} files` : null;

  return (
    <section className="my-9" aria-label={title}>
      {phase === "idle" && (
        <DropZone
          isDragging={ingestion.isDragging}
          onDragEnter={ingestion.handleDragEnter}
          onDragOver={ingestion.handleDragOver}
          onDragLeave={ingestion.handleDragLeave}
          onDrop={onDrop}
          onFileInput={onFileInput}
          title={title}
          hint={hint}
        />
      )}

      {phase === "processing" && (
        <div className="rounded-panel border-border-strong bg-surface-alt flex items-center gap-3 border px-5 py-8">
          <Loader2
            className="text-primary h-5 w-5 animate-spin motion-reduce:animate-none"
            strokeWidth={2}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-ink text-[14px] font-medium">{heading}</p>
            {detail && <p className="text-ink-muted mt-0.5 font-mono text-[12px]">{detail}</p>}
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="rounded-panel border-border-strong bg-surface-alt border p-5">
          {filesCombined === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-ink-secondary text-[14px] leading-relaxed" role="status">
                Nothing text-like to combine there. Try a folder of source files or documents.
              </p>
              <StartOverButton onClick={startOver} />
            </div>
          ) : (
            <>
              <div
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                role="status"
                aria-live="polite"
              >
                <span className="font-display text-ink text-[17px] font-semibold">
                  {filesCombined} {filesCombined === 1 ? "file" : "files"} combined
                </span>
                <span className="text-ink-faint" aria-hidden="true">
                  ·
                </span>
                <span className="text-ink-secondary font-mono text-[13px]">
                  <span className="text-primary">≈ {tokens.toLocaleString()}</span> tokens
                </span>
              </div>
              <p className="text-ink-muted mt-1.5 text-[13px] leading-relaxed">
                Filtered with the defaults: lockfiles, build output, and binaries are left out. The
                full tool lets you change what is in or out.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={copy}
                  className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {copied ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy bundle"}
                </button>
                <StartOverButton onClick={startOver} className="ml-auto" />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function StartOverButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-ink-faint hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      Start over
    </button>
  );
}
