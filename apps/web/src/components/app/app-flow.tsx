import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CONFIG,
  MULTI_OUTPUT_LIMIT,
  addLineNumbers,
  assembleOutput,
  generateFileTree,
  generateProjectName,
} from "@fileconcat/core";

import { useConfig } from "~/hooks/use-config";
import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { useFilterState } from "~/hooks/use-filter-state";
import { useOutputGeneration } from "~/hooks/use-output-generation";
import { estimateTokenCount, preloadTokenEstimator } from "~/lib/tokens";
import { classifyUrl, type Classification, type ImportTab } from "~/lib/classify-url";

import { MarketingSections, SiteFooter } from "./marketing";

import { TopBar } from "./top-bar";
import { LandingHero } from "./landing-hero";
import { ProcessingView } from "./processing-view";
import { ResultView } from "./result-view";
import { ResultEmpty, type EmptyKind } from "./result-empty";
import { SettingsDrawer } from "./settings-drawer";

type Phase = "landing" | "processing" | "result";

// Plain-language narration for a local drop or browse.
const LOCAL_STEPS = [
  "Reading your files",
  "Skipping noise: node_modules, lockfiles",
  "Counting tokens",
  "Packing it into one file",
];
// A dropped archive gets a leading unpack beat before the usual steps.
const ARCHIVE_STEPS = ["Unpacking the archive", ...LOCAL_STEPS];
const STEP_MS = 560;
const PRE_RESULT_MS = 460;

// Archives we can unpack in the browser. 7z / rar are not here: they fall
// through to the usual skip handling with a friendly heads-up on the result.
const UNPACKABLE_RE = /\.(zip|tar\.gz|tgz|tar|gz)$/i;

/**
 * When a batch includes an unpackable archive, give `begin()` the unpack
 * narration and a label naming the archive and its kind. Detected synchronously
 * from the FileList so the step shows before the async unpack runs.
 */
function archiveBeginOptions(
  files: FileList | null | undefined,
): { steps: string[]; label: string } | undefined {
  if (!files) return undefined;
  const archive = Array.from(files).find((f) => UNPACKABLE_RE.test(f.name));
  if (!archive) return undefined;
  const ext = archive.name.match(UNPACKABLE_RE)?.[1]?.toLowerCase() ?? "archive";
  return { steps: ARCHIVE_STEPS, label: `${archive.name.replace(UNPACKABLE_RE, "")} (${ext})` };
}

type ImportNarration = { steps: string[]; label: string; note: string };

/** Source-specific processing narration + the green result note for an import. */
function importNarration(c: Classification): ImportNarration {
  if (c.kind === "repo") {
    const fetchStep = c.slug
      ? `Fetching ${c.slug} from ${c.hostName}`
      : `Fetching from ${c.hostName}`;
    return {
      steps: [
        fetchStep,
        "Reading the files",
        "Skipping noise: node_modules, lockfiles",
        "Counting tokens",
        "Packing it into one file",
      ],
      label: c.slug ? `${c.slug} (${c.hostName})` : c.hostName,
      note: `Fetched straight from ${c.hostName}. Nothing stored.`,
    };
  }
  if (c.kind === "gist") {
    return {
      steps: [
        "Fetching the gist",
        "Reading the files",
        "Counting tokens",
        "Packing it into one file",
      ],
      label: "Gist",
      note: "Grabbed every file in the gist.",
    };
  }
  return {
    steps: [
      "Fetching the page",
      "Extracting readable text",
      "Counting tokens",
      "Packing it into one file",
    ],
    label: `${c.hostName} (web page)`,
    note: "Pulled the readable text off the page. Nav, ads and scripts stripped.",
  };
}

/** Turn an engine fetch error into a friendly, info-toned line (never red). */
function friendlyFetchError(error: unknown, c: Classification): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) return null;
  if (/not found|404/i.test(message))
    return `Couldn't find that one. Check the ${c.hostName} link is public and spelled right.`;
  if (/rate limit|rate-limit|429/i.test(message))
    return `${c.hostName} is rate-limiting requests right now. Give it a minute and try again.`;
  if (/invalid|format|expected/i.test(message))
    return "Use a full repo URL, like github.com/owner/repo, rather than a profile or search page.";
  if (/private|403|auth/i.test(message))
    return "Only public links can be fetched. This one looks private or needs a login.";
  return "Couldn't fetch that link. Make sure it's public and try again.";
}

/**
 * The single-page state machine: landing → processing → result, plus a drawer
 * (wired later). It owns the engine hooks and choreographs the views; the
 * processing narration runs for its full beat even when the work finishes early.
 */
export function AppFlow() {
  const { config, setConfig } = useConfig();
  // Wire the user's per-file size cap into ingestion. Binary + hidden filtering
  // stay on (from DEFAULT_CONFIG) so content-sniffing still runs.
  const ingestionConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, maxFileSizeMB: config.maxFileSizeMB }),
    [config.maxFileSizeMB],
  );
  const ingestion = useFileIngestion(ingestionConfig);
  const filter = useFilterState({
    entries: ingestion.entries,
    validations: ingestion.validations,
    includePatterns: config.includePatterns,
    ignorePatterns: config.ignorePatterns,
  });

  const [phase, setPhase] = useState<Phase>("landing");
  const [stepIndex, setStepIndex] = useState(0);
  const [workDone, setWorkDone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSteps, setActiveSteps] = useState<string[]>(LOCAL_STEPS);
  const [processingLabel, setProcessingLabel] = useState("");
  // When set, the narration will not tick past this step until the real work
  // resolves. Used for remote imports so "Fetching…" holds for the whole fetch.
  const [gateIndex, setGateIndex] = useState<number | null>(null);

  // Import (progressive disclosure on the landing hero). Kept here, above the
  // phase switch, so a failed fetch can return to landing with the URL and a
  // friendly note intact — the hero unmounts during processing.
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>("github");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [resultNote, setResultNote] = useState<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  // --- engine derivations (mirrors the legacy orchestrator) -----------------
  const includedContents = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    const transform = config.showLineNumbers ? addLineNumbers : null;
    return ingestion.entries
      .filter((e) => included.has(e.path))
      .map((e) => ({ path: e.path, content: transform ? transform(e.content) : e.content }));
  }, [ingestion.entries, filter.fileStatuses, config.showLineNumbers]);

  const [estimatorReady, setEstimatorReady] = useState(false);
  useEffect(() => {
    void preloadTokenEstimator().then(() => setEstimatorReady(true));
  }, []);
  const tokens = useMemo(() => {
    if (includedContents.length === 0) return 0;
    return estimateTokenCount(includedContents.map((c) => c.content).join("\n"));
    // estimatorReady is a recompute trigger once tiktoken loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedContents, estimatorReady]);

  const output = useOutputGeneration({
    includedContents,
    tokens,
    sourceUrl: ingestion.sourceUrl,
    outputStyle: config.outputStyle,
    formatPreference: config.defaultOutputFormat,
    chunkSizeKB: config.chunkSizeKB,
  });

  const previewText = useMemo(() => {
    if (includedContents.length === 0) return "";
    const tree = generateFileTree(includedContents.map((f) => f.path));
    const projectName = generateProjectName(includedContents.map((f) => f.path));
    return assembleOutput({
      projectName,
      files: includedContents,
      tree,
      style: config.outputStyle,
      source: ingestion.sourceUrl ?? undefined,
    });
  }, [includedContents, config.outputStyle, ingestion.sourceUrl]);

  // --- result summary -------------------------------------------------------
  const filesCombined = filter.includedFileCount;
  // Files the engine couldn't read as text (binaries, oversize) + read failures.
  const unsupported = useMemo(() => {
    const list: { name: string; why: string }[] = [];
    const whyFor = (name: string, fallback: string) =>
      /\.(7z|rar)$/i.test(name)
        ? "This archive type can't be opened in the browser. Unzip it first, or use .zip or .tar."
        : fallback;
    for (const [path, v] of Object.entries(ingestion.validations)) {
      if (!v.included) {
        const name = path.split("/").pop() ?? path;
        list.push({ name, why: whyFor(name, v.reason ?? "not text") });
      }
    }
    for (const f of ingestion.failedFiles) {
      list.push({ name: f.path.split("/").pop() ?? f.path, why: f.error });
    }
    return list;
  }, [ingestion.validations, ingestion.failedFiles]);
  // "Noise" = valid text excluded by ignore patterns — not the non-text files above.
  const noiseSkipped = useMemo(() => {
    const rejected = new Set(
      Object.entries(ingestion.validations)
        .filter(([, v]) => !v.included)
        .map(([p]) => p),
    );
    return filter.fileStatuses.filter((s) => !s.included && !rejected.has(s.path)).length;
  }, [filter.fileStatuses, ingestion.validations]);
  const bigBundle = tokens > MULTI_OUTPUT_LIMIT;
  const projectName = useMemo(
    () =>
      ingestion.entries.length ? generateProjectName(ingestion.entries.map((e) => e.path)) : "",
    [ingestion.entries],
  );
  const isFolder = useMemo(
    () => ingestion.entries.some((e) => e.path.includes("/")),
    [ingestion.entries],
  );
  const sourceLabel =
    ingestion.sourceUrl ??
    (isFolder
      ? `${projectName} (folder)`
      : `${ingestion.entries.length} ${ingestion.entries.length === 1 ? "file" : "files"}`);
  const droppedFiles = useMemo(
    () => ingestion.entries.map((e) => e.path.split("/").pop() ?? e.path),
    [ingestion.entries],
  );
  // Tailor the empty-state rescue to what was actually dropped: a lone .7z is
  // an archive we can't open, not "an image". Archive wins (a .7z reads as a
  // binary otherwise); images next; everything else falls back to a generic.
  const emptyKind = useMemo((): EmptyKind => {
    if (droppedFiles.length === 0) return "other";
    const ARCHIVE = /\.(7z|rar|zip|tar\.gz|tgz|tar|gz|bz2|xz)$/i;
    const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic|heif|tiff?)$/i;
    if (droppedFiles.some((n) => ARCHIVE.test(n))) return "archive";
    const images = droppedFiles.filter((n) => IMAGE.test(n)).length;
    if (images > 0 && images >= droppedFiles.length / 2) return "image";
    return "other";
  }, [droppedFiles]);

  // --- flow control ---------------------------------------------------------
  // Runs the processing theatre for `run`. Rethrows so an import can recover
  // (drop / browse swallow their own errors, so they never reject here).
  const begin = useCallback(
    async (
      run: () => Promise<void>,
      opts?: { steps?: string[]; label?: string; gateIndex?: number },
    ) => {
      setActiveSteps(opts?.steps ?? LOCAL_STEPS);
      setProcessingLabel(opts?.label ?? "");
      setGateIndex(opts?.gateIndex ?? null);
      setPhase("processing");
      setStepIndex(0);
      setWorkDone(false);
      try {
        await run();
      } finally {
        setWorkDone(true);
      }
    },
    [],
  );

  // advance the narration one step at a time
  useEffect(() => {
    if (phase !== "processing" || stepIndex >= activeSteps.length - 1) return;
    // Hold on a gated step (the remote fetch) until the real work resolves, so
    // we never tick it off while the request is still in flight.
    if (gateIndex !== null && stepIndex >= gateIndex && !workDone) return;
    const t = setTimeout(() => setStepIndex((i) => i + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [phase, stepIndex, activeSteps, gateIndex, workDone]);

  // reveal the result once the work is done AND the narration has played out
  useEffect(() => {
    if (phase !== "processing" || !workDone || stepIndex < activeSteps.length - 1) return;
    const t = setTimeout(() => setPhase("result"), PRE_RESULT_MS);
    return () => clearTimeout(t);
  }, [phase, workDone, stepIndex, activeSteps]);

  const percent =
    workDone && stepIndex >= activeSteps.length - 1
      ? 100
      : Math.min(95, Math.round(((stepIndex + 1) / activeSteps.length) * 100));

  const startOver = useCallback(() => {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    ingestion.reset();
    filter.reset();
    output.reset();
    setPhase("landing");
    setStepIndex(0);
    setWorkDone(false);
    setResultNote(null);
    setImportOpen(false);
    setImportUrl("");
    setImportError(null);
  }, [ingestion, filter, output]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setResultNote(null);
      const opts = archiveBeginOptions(e.dataTransfer?.files);
      void begin(() => ingestion.handleDrop(e), opts);
    },
    [begin, ingestion],
  );
  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setResultNote(null);
      const opts = archiveBeginOptions(e.target.files);
      void begin(() => ingestion.handleFileInput(e), opts);
    },
    [begin, ingestion],
  );

  const runImport = useCallback(() => {
    const c = classifyUrl(importUrl, importTab);
    if (c.kind === "empty" || c.kind === "bad") {
      setImportError("That doesn't look like a link yet. Paste a public repo, Gist, or page URL.");
      return;
    }
    if (c.kind === "binary") {
      setImportError(
        `That link points to a ${c.fileType} file, which can't be read as text. Try a repo, a Gist, or a page with text.`,
      );
      return;
    }
    setImportError(null);
    const narration = importNarration(c);
    setResultNote(narration.note);
    const controller = new AbortController();
    importAbortRef.current = controller;
    void (async () => {
      try {
        await begin(() => ingestion.ingestRepo(c.url, c.sourceType!, () => {}, controller.signal), {
          steps: narration.steps,
          label: narration.label,
          gateIndex: 0,
        });
      } catch (error) {
        setPhase("landing");
        setResultNote(null);
        setImportError(friendlyFetchError(error, c));
      }
    })();
  }, [importUrl, importTab, begin, ingestion]);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <TopBar
        view={phase}
        onStartOver={startOver}
        onOpenSettings={phase === "result" ? () => setSettingsOpen(true) : undefined}
      />

      <main className="flex-1">
        {phase === "landing" && (
          <>
            <LandingHero
              isDragging={ingestion.isDragging}
              onDragEnter={ingestion.handleDragEnter}
              onDragOver={ingestion.handleDragOver}
              onDragLeave={ingestion.handleDragLeave}
              onDrop={onDrop}
              onFileInput={onFileInput}
              importControls={{
                open: importOpen,
                onOpen: () => setImportOpen(true),
                panel: {
                  tab: importTab,
                  onTabChange: (t) => {
                    setImportTab(t);
                    setImportError(null);
                  },
                  url: importUrl,
                  onUrlChange: (u) => {
                    setImportUrl(u);
                    setImportError(null);
                  },
                  error: importError,
                  onFetch: runImport,
                  isFetching: ingestion.isRepoLoading,
                  onClose: () => setImportOpen(false),
                },
              }}
            />
            <div className="mt-16">
              <MarketingSections />
            </div>
          </>
        )}

        {phase === "processing" && (
          <ProcessingView
            percent={percent}
            sourceLabel={processingLabel || ingestion.processingStatus || "Reading your files…"}
            steps={activeSteps}
            stepIndex={stepIndex}
          />
        )}

        {phase === "result" &&
          (filesCombined === 0 ? (
            <ResultEmpty droppedFiles={droppedFiles} kind={emptyKind} onStartOver={startOver} />
          ) : (
            <ResultView
              sourceLabel={sourceLabel}
              note={
                resultNote ??
                (ingestion.expandedArchive
                  ? "Unpacked the archive and combined everything inside."
                  : null)
              }
              filesCombined={filesCombined}
              tokens={tokens}
              noiseSkipped={noiseSkipped}
              outputStyle={config.outputStyle}
              onOutputStyleChange={(style) => setConfig({ outputStyle: style })}
              isCopied={output.isCopied}
              isGenerating={output.isGenerating}
              onCopy={output.copy}
              onDownload={output.download}
              previewText={previewText}
              unsupported={unsupported}
              bigBundle={bigBundle}
              splitMode={output.selectedFormat}
              onSplitModeChange={(mode) => setConfig({ defaultOutputFormat: mode })}
            />
          ))}
      </main>

      {phase === "landing" && <SiteFooter />}

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        setConfig={setConfig}
        fileStatuses={filter.fileStatuses}
        onToggleFile={filter.toggleFile}
        onToggleMultipleFiles={filter.toggleMany}
        includedFileCount={filter.includedFileCount}
        tokens={tokens}
      />
    </div>
  );
}
