import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CONFIG,
  MULTI_OUTPUT_LIMIT,
  SPLIT_OUTPUT_ENABLED,
  addLineNumbers,
  assembleOutput,
  generateFileTree,
  generateProjectName,
  summarizeExclusions,
} from "@fileconcat/core";

import { useConfig } from "~/hooks/use-config";
import { useClipperPush } from "~/hooks/use-clipper-push";
import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { useFilterState } from "~/hooks/use-filter-state";
import { useOutputGeneration } from "~/hooks/use-output-generation";
import { estimateTokenCount, preloadTokenEstimator } from "~/lib/tokens";
import { weighBundle } from "~/lib/bundle-weight";
import { useSelectedModel } from "~/hooks/use-selected-model";
import { classifyUrl, type Classification, type ImportTab } from "~/lib/classify-url";
import {
  addToTally,
  currentRun,
  track,
  trackEntrySurface,
  trackTally,
  type Tally,
} from "~/lib/metrics";
import { tagSurface } from "~/lib/clarity-tags";
import { ocrLanguageName, ocrLanguageOptions } from "~/lib/ocr-language";

import { MarketingSections, SiteFooter } from "./marketing";

import { TopBar } from "./top-bar";
import { LandingHero } from "./landing-hero";
import type { DropZoneProps } from "./drop-zone";
import { ProcessingView } from "./processing-view";
import { ResultView } from "./result-view";
import { ResultEmpty } from "./result-empty";
import { ReadingDialog } from "./reading-dialog";
import { emptyKindFor, emptyReasonSlug } from "./empty-kind";
import { isRecognisableImage, type IncomingFile } from "~/hooks/use-file-ingestion";
import { SettingsDrawer } from "./settings-drawer";

type Phase = "landing" | "processing" | "result";

/**
 * The line under the result heading, and the one thing it can offer to do.
 *
 * The action exists for one case: a clipper push that landed on a bundle that
 * was already there. Appending is what the extension is for, but it is silent,
 * and a second batch sent into a tab still holding the first one comes out as
 * one bundle covering both. So the note says what the push landed on, and
 * carries the way back.
 */
type ResultNote = { text: string; action?: { label: string; onClick: () => void } };

const many = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** How much recognised text the reading dialog holds per document. */
const SAMPLE_LIMIT = 2000;

type ImportNarration = { label: string; note: string };

/** Source label + the green result note for an import. The processing view's
 * live progress comes from the ingestion engine, not a scripted narration. */
function importNarration(c: Classification): ImportNarration {
  if (c.kind === "repo") {
    return {
      label: c.slug ? `${c.slug} (${c.hostName})` : c.hostName,
      note: `Fetched straight from ${c.hostName}. Nothing stored.`,
    };
  }
  if (c.kind === "gist") {
    return { label: "Gist", note: "Grabbed every file in the gist." };
  }
  return {
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
  if (/rate limit|rate-limit|429|too many requests/i.test(message))
    return `${c.hostName} is rate-limiting requests right now. Give it a minute and try again.`;
  if (/invalid|format|expected/i.test(message))
    return "Use a full repo URL, like github.com/owner/repo, rather than a profile or search page.";
  if (/private|403|auth/i.test(message))
    return "Only public links can be fetched. This one looks private or needs a login.";
  return "Couldn't fetch that link. Make sure it's public and try again.";
}

type AppFlowProps = {
  /**
   * Replace the default landing (home hero + marketing sections) with custom
   * content — used by the persona routes to host the same flow under their own
   * hero. Receives the wired drop handlers so an embedded DropZone starts the
   * flow in place. When omitted, the home landing renders. Processing, result,
   * TopBar, and the settings drawer are unaffected either way.
   *
   * Drop handlers only, deliberately: the link-import row is a home-landing
   * affordance, so a persona hero gets no way to render one. See `ImportPanel`.
   */
  renderLanding?: (dropProps: DropZoneProps) => React.ReactNode;
};

/**
 * The single-page state machine: landing → processing → result, plus a drawer
 * (wired later). It owns the engine hooks and choreographs the views; the
 * processing narration runs for its full beat even when the work finishes early.
 */
export function AppFlow({ renderLanding }: AppFlowProps = {}) {
  const { config, setConfig } = useConfig();
  // Binary + hidden filtering only. There is no size cap any more: nothing in
  // ingestion reads `maxFileSizeMB`, and how heavy a bundle turned out is
  // reported on the result screen instead of decided here.
  const ingestion = useFileIngestion(DEFAULT_CONFIG);
  // Owned here, not in the drawer: both the cost estimate and the result
  // screen's context-fit line measure against the same chosen model.
  const modelPicker = useSelectedModel();
  const filter = useFilterState({
    entries: ingestion.entries,
    validations: ingestion.validations,
    includePatterns: config.includePatterns,
    ignorePatterns: config.ignorePatterns,
  });

  // The tool renders on the home route, every /for/* persona page and the
  // how-to page; paired with output_taken under the same page id this reads as
  // a funnel. AppFlow remounts on client navigation while the page id lives on,
  // so trackEntrySurface itself only records the first call of a page load —
  // the counter describes the page load, not this component's lifetime.
  useEffect(() => {
    trackEntrySurface(window.location.pathname);
    tagSurface(window.location.pathname);
  }, []);

  const [phase, setPhase] = useState<Phase>("landing");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which part of the drawer the opener was asking for. Only the result's fit
  // line asks for the model picker; every other door lands at the top.
  const [settingsFocusModel, setSettingsFocusModel] = useState(false);
  const openSettings = (focusModel = false) => {
    setSettingsFocusModel(focusModel);
    setSettingsOpen(true);
  };
  const [readingOpen, setReadingOpen] = useState(false);
  // The source identity shown under the spinner (import slug/host, else "").
  const [processingLabel, setProcessingLabel] = useState("");

  // Import. Kept here, above the phase switch, so a failed fetch can return to
  // landing with the URL and a friendly note intact. The hero unmounts during
  // processing, and there is no open/closed state any more: the row is always
  // visible under the drop target, on every landing (see `ImportPanel`).
  const [importTab, setImportTab] = useState<ImportTab>("github");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [resultNote, setResultNote] = useState<ResultNote | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  // --- engine derivations (mirrors the legacy orchestrator) -----------------
  const includedContents = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    const transform = config.showLineNumbers ? addLineNumbers : null;
    return ingestion.entries
      .filter((e) => included.has(e.path))
      .map((e) => ({
        path: e.path,
        content: transform ? transform(e.content) : e.content,
        recognised: e.recognised,
      }));
  }, [ingestion.entries, filter.fileStatuses, config.showLineNumbers]);

  // Real content gaps the model can't see in the tree (ADR-0008). Reported in
  // the bundle summary; noise and user-deselected files are never listed.
  const excluded = useMemo(
    () => summarizeExclusions(filter.fileStatuses),
    [filter.fileStatuses],
  );

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
    excluded,
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
      excluded,
    });
  }, [includedContents, config.outputStyle, ingestion.sourceUrl, excluded]);

  // --- result summary -------------------------------------------------------
  const filesCombined = filter.includedFileCount;
  // Two honest buckets for what didn't make it in. `notText` genuinely can't be
  // combined (binary, archive, unreadable). `skippedByDefault` IS readable text,
  // just held back by a default rule (hidden dotfiles; the size cap that used
  // to land here is gone), so it gets its own framing and stays one click from
  // being re-included.
  const { notText, skippedByDefault } = useMemo(() => {
    const notText: { name: string; why: string }[] = [];
    const skippedByDefault: { name: string; why: string }[] = [];
    const archiveWhy = (name: string, fallback: string) =>
      /\.(7z|rar)$/i.test(name)
        ? "This archive type can't be opened in the browser. Unzip it first, or use .zip or .tar."
        : fallback;
    // A document that opened but held no text has its own card and its own
    // remedy, so it must not also appear here as "isn't text" — a scan is text,
    // it is just text nobody has read yet.
    const unread = new Set(ingestion.unreadDocuments.map((d) => d.path));
    for (const [path, v] of Object.entries(ingestion.validations)) {
      if (v.included || unread.has(path)) continue;
      const name = path.split("/").pop() ?? path;
      const reason = v.reason ?? "";
      // Hidden dotfiles are the only occupant left. This also tested for
      // "File size exceeds", which no path can produce since the per-file cap
      // was removed — a dead branch that kept the old string in the bundle.
      if (reason === "Hidden file") {
        skippedByDefault.push({ name, why: reason });
      } else {
        notText.push({ name, why: archiveWhy(name, reason || "Not text") });
      }
    }
    for (const f of ingestion.failedFiles) {
      notText.push({ name: f.path.split("/").pop() ?? f.path, why: f.error });
    }
    return { notText, skippedByDefault };
  }, [ingestion.validations, ingestion.failedFiles, ingestion.unreadDocuments]);
  // "Noise" = valid text excluded by ignore patterns — not the non-text files above.
  const noiseSkipped = useMemo(() => {
    const rejected = new Set(
      Object.entries(ingestion.validations)
        .filter(([, v]) => !v.included)
        .map(([p]) => p),
    );
    return filter.fileStatuses.filter((s) => !s.included && !rejected.has(s.path)).length;
  }, [filter.fileStatuses, ingestion.validations]);
  // Included files that decoded as "ambiguous" — kept in, flagged for a look.
  const flaggedFiles = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(([path, v]) => v.classification === "ambiguous" && included.has(path))
      .map(([path]) => path.split("/").pop() ?? path);
  }, [ingestion.validations, filter.fileStatuses]);
  // Included files whose text was extracted from a document (PDF/Office/ODF).
  const extractedFiles = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(([path, v]) => v.extracted && included.has(path))
      .map(([path]) => path.split("/").pop() ?? path);
  }, [ingestion.validations, filter.fileStatuses]);
  // Included documents that lost whole pages. The reader says so (ADR-0008) and
  // until now nobody read it, so a PDF missing three pages reached the bundle
  // looking exactly like one missing none.
  //
  // Only this one kind, out of five. `ocr-failed` is what the scanned documents
  // card is already about, and `parser-unavailable` / `cdn-fallback` describe a
  // file that produced no text at all, which is not in the bundle to caveat.
  // `attachments-skipped` is the one deliberately left out: it is honest, but a
  // notebook emits it for every markdown cell holding an image, and notebooks
  // are the second most extracted format here — so the card would fire mostly
  // on drops where nothing is wrong, and a caveat that is usually noise is one
  // nobody reads on the day it matters. Every kind still reaches `extract_note`,
  // so nothing is lost, it just goes to the counters instead of the screen.
  const partialDocuments = useMemo(() => {
    const included = new Set(filter.fileStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(([path, v]) => included.has(path) && v.notes?.includes("pages-skipped"))
      .map(([path]) => ({ name: path.split("/").pop() ?? path, why: "pages missing" }));
  }, [ingestion.validations, filter.fileStatuses]);
  const bigBundle = SPLIT_OUTPUT_ENABLED && tokens > MULTI_OUTPUT_LIMIT;
  // What the removed 32 MB per-file cap used to decide silently, reported
  // instead. Measured over the files that actually made the bundle, so
  // deselecting the heavy one in the drawer visibly moves it.
  const weight = useMemo(
    () =>
      weighBundle({
        files: includedContents,
        tokens,
        model: modelPicker.selectedModel
          ? {
              name: modelPicker.selectedModel.name,
              contextLimit: modelPicker.selectedModel.contextLimit,
            }
          : null,
      }),
    [includedContents, tokens, modelPicker.selectedModel],
  );
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
  // Sourced from validations, not entries: files that produce no content entry
  // (unextractable or oversize documents, a zero-file remote) are exactly what
  // lands on the empty state, and they carry a validation but no entry. Reading
  // from entries would leave the histogram empty precisely when it is shown.
  const droppedFiles = useMemo(
    () => Object.keys(ingestion.validations).map((p) => p.split("/").pop() ?? p),
    [ingestion.validations],
  );
  // Readable files sitting excluded in the tree. The one thing that makes the
  // settings drawer worth offering from the empty state: without a row anyone
  // could re-include, Adjust opens an empty room. Binaries are locked out of
  // curation (ADR-0009), so they never count.
  const adjustableCount = useMemo(
    () =>
      filter.fileStatuses.filter((s) => !s.included && s.classification !== "binary").length,
    [filter.fileStatuses],
  );
  /**
   * Whether an include pattern is what excluded anything, so the empty screen
   * can stop naming ignore rules that were never involved. Once `empty_reason`
   * was deployed an include pattern turned out to be the most common single
   * reason a bundle came out empty, and the screen was sending every one of
   * those people to look for an ignore rule that did not exist.
   *
   * Goes through `emptyReasonSlug` rather than comparing the wording here, so a
   * copy edit in `excludeReason` cannot leave this silently matching nothing.
   */
  const excludedByInclude = useMemo(
    () =>
      filter.fileStatuses.some(
        (s) => !s.included && emptyReasonSlug(s.reason) === "include",
      ),
    [filter.fileStatuses],
  );
  /**
   * The two populations recognition can read, told apart by format (ADR-0017).
   * They share every mechanism and differ in one thing: a document's pass starts
   * by itself, so an unread document is a gap, while an unread image is only an
   * offer nobody has taken. One count for both would say neither.
   */
  const recognition = useMemo(() => {
    const isImage = (d: { format: string }) => isRecognisableImage(d.format);
    const images = ingestion.scannedDocuments.filter(isImage);
    const unreadImages = ingestion.unreadDocuments.filter(isImage);
    return {
      imageCount: images.length,
      recognisedImages: images.length - unreadImages.length,
      unreadDocumentCount: ingestion.unreadDocuments.length - unreadImages.length,
      // Only the ones no pass has been over yet. Once recognition has looked and
      // found nothing, the offer is spent and the empty screen says so instead.
      offerableImageCount: unreadImages.filter(
        (d) => ingestion.validations[d.path]?.recognitionTried !== true,
      ).length,
    };
  }, [ingestion.scannedDocuments, ingestion.unreadDocuments, ingestion.validations]);

  const emptyKind = useMemo(
    () =>
      emptyKindFor(
        droppedFiles,
        recognition.unreadDocumentCount,
        adjustableCount,
        recognition.offerableImageCount,
      ),
    [droppedFiles, recognition, adjustableCount],
  );

  /**
   * Why the bundle came out empty, recorded once per Run. `bundle_size` is
   * absent for every one of these Runs, which says the screen was reached and
   * nothing else; this says whether a filter or the content did it.
   *
   * Reasons come from two lists because they answer for different files: a
   * document that produced no entry (a scan, an unreadable container) has a
   * validation and no file status, while a file the patterns ate has both and
   * only the status carries which pattern. Keyed on validations so the first
   * kind is not silently missing from the total.
   */
  const emptiedRun = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "result" || includedContents.length > 0) return;
    const paths = Object.keys(ingestion.validations);
    if (paths.length === 0) return;
    const run = currentRun();
    if (run === null || run === emptiedRun.current) return;
    emptiedRun.current = run;

    const statuses = new Map(filter.fileStatuses.map((s) => [s.path, s]));
    const tally: Tally = new Map();
    for (const path of paths) {
      const reason = statuses.get(path)?.reason ?? ingestion.validations[path]?.reason;
      addToTally(tally, emptyReasonSlug(reason));
    }
    trackTally("empty_reason", tally);
  }, [phase, includedContents, filter.fileStatuses, ingestion.validations]);

  // --- flow control ---------------------------------------------------------
  // Runs `run`, showing the processing view driven by the engine's real
  // progress, then reveals the result the moment work resolves — no padding, no
  // scripted steps. The `finally` is what keeps a rejecting `run` from
  // stranding the UI on the processing screen forever: drop / browse already
  // swallow their own errors, but a caller that doesn't (the extension push)
  // still needs the phase to move on. The rejection itself isn't caught here —
  // it propagates so an import's own try/catch can recover, or, unhandled,
  // surfaces in the console instead of failing silently.
  const begin = useCallback(async (run: () => Promise<void>, opts?: { label?: string }) => {
    setProcessingLabel(opts?.label ?? "");
    setPhase("processing");
    try {
      await run();
    } finally {
      setPhase("result");
    }
  }, []);

  // Honest progress, straight from the ingestion engine. A `null` percent is
  // indeterminate (spinner only) while a phase's total is still unknown.
  const progress = ingestion.progress;
  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  // The engine's live stage note wins as the heading (Connecting → Listing →
  // Downloading), falling back to the phase name once files start streaming.
  const isRecognising = progress?.phase === "recognising";
  // Built once: sixty entries through Intl.DisplayNames and a sort, for a
  // control most drops never render.
  const languageOptions = useMemo(() => ocrLanguageOptions(), []);
  // The tag a pass ran under is whatever the browser reported (`tr-TR`), while
  // the control offers one canonical tag per model (`tr`). Matching on the model
  // is what keeps the select from rendering blank on a tag it has no option for.
  const readLocale =
    languageOptions.find((o) => o.code === ingestion.readLanguage?.code)?.locale ?? null;
  /**
   * What to call the reading on the summary card. A scoped re-read can leave
   * two documents read in two languages, and there is no honest single name for
   * that, so the card counts them instead and the dialog says which is which.
   */
  const readLanguageNote = useMemo(() => {
    const names = new Set(
      Object.values(ingestion.readLanguages).map((language) => ocrLanguageName(language)),
    );
    if (names.size === 0) return null;
    return names.size === 1 ? `as ${[...names][0]}` : `in ${names.size} languages`;
  }, [ingestion.readLanguages]);
  /**
   * Every scanned document in this Run with whatever recognition made of it,
   * for the dialog that lets a reading be checked and done again. Read or not,
   * all of them: a document that came back in the wrong language reads as a
   * success, so the ones that "worked" are exactly the ones worth looking at.
   *
   * Capped, because this is a spot-check and not a reader. A wrong language is
   * obvious in the first line; the whole text is in the bundle.
   */
  const readingDocuments = useMemo(() => {
    const stillUnread = new Set(ingestion.unreadDocuments.map((d) => d.path));
    const contentByPath = new Map(ingestion.entries.map((e) => [e.path, e.content]));
    return ingestion.scannedDocuments.map((d) => {
      const text = stillUnread.has(d.path) ? "" : (contentByPath.get(d.path) ?? "");
      const language = ingestion.readLanguages[d.path];
      return {
        path: d.path,
        name: d.path.split("/").pop() ?? d.path,
        text: text.length > SAMPLE_LIMIT ? `${text.slice(0, SAMPLE_LIMIT)}\n...` : text,
        tried: ingestion.validations[d.path]?.recognitionTried === true,
        language: language ? ocrLanguageName(language) : null,
      };
    });
  }, [
    ingestion.scannedDocuments,
    ingestion.unreadDocuments,
    ingestion.entries,
    ingestion.validations,
    ingestion.readLanguages,
  ]);
  const processingHeading =
    progress?.note ??
    (progress?.phase === "fetching"
      ? "Fetching files"
      : progress?.phase === "unpacking"
        ? "Unpacking archive"
        : isRecognising
          ? "Reading scanned pages"
          : "Reading files");
  const processingDetail =
    progress && progress.total > 0
      ? `${progress.done} / ${progress.total} ${isRecognising ? "documents" : "files"}`
      : processingLabel;
  // The one stage measured in seconds a page rather than files a second, and
  // the only one anyone would want out of. Say what it is buying before they
  // decide.
  const processingAside = isRecognising
    ? "These pages are pictures, not text. Recognition reads the pixels here in the browser, which takes a few seconds a page."
    : undefined;

  const startOver = useCallback(() => {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    ingestion.reset();
    filter.reset();
    output.reset();
    setPhase("landing");
    setReadingOpen(false);
    setResultNote(null);
    setImportUrl("");
    setImportError(null);
  }, [ingestion, filter, output]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setResultNote(null);
      void begin(() => ingestion.handleDrop(e));
    },
    [begin, ingestion],
  );
  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setResultNote(null);
      void begin(() => ingestion.handleFileInput(e));
    },
    [begin, ingestion],
  );

  // Clippings from the browser extension arrive as finished `.md` files and
  // take the same road as a drop, so a push is one Run exactly like one drop.
  //
  // It appends, because the thing the extension exists for is a repo *and* the
  // discussion about it. A push that replaced the bundle could never produce
  // that in either order.
  useClipperPush(
    useCallback(
      (files: IncomingFile[]) => {
        setResultNote(null);
        // Both read before the ingest: afterwards the two batches are one set,
        // and nothing in the bundle can tell them apart again.
        const landedOn = ingestion.entries.length;
        // Resolved the way `prepareBatch` resolves it, so these are the keys
        // the bundle actually files them under.
        const paths = files.map((f) => f.path || f.file.webkitRelativePath || f.file.name);
        void begin(async () => {
          await ingestion.ingestBatch(files, { append: "clipper" });
          // Nothing was mixed, so there is nothing to say and nothing to undo.
          if (landedOn === 0) return;
          setResultNote({
            text: `${many(files.length, "clipping")} added to the ${many(landedOn, "file")} already here.`,
            action: {
              label: "Keep only the clippings",
              onClick: () => {
                ingestion.keepOnly(paths);
                setResultNote({ text: "Kept just the clippings from this push." });
              },
            },
          });
        });
      },
      [begin, ingestion],
    ),
  );

  // The same road for the drop's own gesture: without this the extension would
  // be able to do something the app's primary gesture cannot.
  const onAddFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setResultNote(null);
      void begin(() => ingestion.handleFileInput(e, { append: "manual" }));
    },
    [begin, ingestion],
  );

  // The wired drop handlers, shared by the default hero and any persona landing
  // (via renderLanding) so an embedded DropZone starts the flow in place.
  const dropProps: DropZoneProps = {
    isDragging: ingestion.isDragging,
    onDragEnter: ingestion.handleDragEnter,
    onDragOver: ingestion.handleDragOver,
    onDragLeave: ingestion.handleDragLeave,
    onDrop,
    onFileInput,
  };

  const runImport = useCallback(() => {
    const c = classifyUrl(importUrl, importTab);
    // Both of these return before `ingestRepo` runs, so they write no
    // `source_used` either: without this the attempt is absent from the data
    // entirely rather than merely unexplained. Per press, not per Run — there is
    // no Run open yet, and a second press against the same rejected link is what
    // says the message did not land.
    if (c.kind === "empty" || c.kind === "bad") {
      track("import_failed", "bad");
      setImportError("That doesn't look like a link yet. Paste a public repo, Gist, or page URL.");
      return;
    }
    if (c.kind === "binary") {
      track("import_failed", "binary");
      setImportError(
        `That link points to a ${c.fileType} file, which can't be read as text. Try a repo, a Gist, or a page with text.`,
      );
      return;
    }
    setImportError(null);
    const narration = importNarration(c);
    setResultNote({ text: narration.note });
    const controller = new AbortController();
    importAbortRef.current = controller;
    void (async () => {
      try {
        await begin(() => ingestion.ingestRepo(c.url, c.sourceType!, controller.signal), {
          label: narration.label,
        });
      } catch (error) {
        // Fires after `source_used` inside the same Run, so that Run appears in
        // both terms of the attempt count. See the counter's own comment.
        //
        // Only when there is something to say. `startOver` aborts the fetch, and
        // `friendlyFetchError` answers null for that: a deliberate cancel is not
        // a failure, and counting it would inflate the rate with people who got
        // exactly what they asked for.
        const message = friendlyFetchError(error, c);
        if (message !== null) track("import_failed", "fetch");
        setPhase("landing");
        setResultNote(null);
        setImportError(message);
      }
    })();
  }, [importUrl, importTab, begin, ingestion]);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <TopBar onStartOver={startOver} />

      <main className="flex-1">
        {phase === "landing" &&
          (renderLanding ? (
            renderLanding(dropProps)
          ) : (
            <>
              <LandingHero
                {...dropProps}
                linkImport={{
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
                }}
              />
              <div className="mt-16">
                <MarketingSections />
              </div>
            </>
          ))}

        {phase === "processing" && (
          <ProcessingView
            percent={percent}
            heading={processingHeading}
            detail={processingDetail}
            aside={processingAside}
            onStop={isRecognising ? ingestion.stopReading : undefined}
            stopLabel="Skip the scanned pages"
          />
        )}

        {phase === "result" &&
          (filesCombined === 0 ? (
            <ResultEmpty
              droppedFiles={droppedFiles}
              kind={emptyKind}
              onStartOver={startOver}
              onAdjust={adjustableCount > 0 ? () => openSettings() : undefined}
              byInclude={excludedByInclude}
              isReading={ingestion.isReading}
              readProgress={ingestion.readProgress}
              stoppedReading={ingestion.stoppedReading}
              onRead={ingestion.readUnreadDocuments}
              onStopReading={ingestion.stopReading}
              onOfferRead={() => setReadingOpen(true)}
            />
          ) : (
            <ResultView
              sourceLabel={sourceLabel}
              note={
                resultNote?.text ??
                (ingestion.expandedArchive
                  ? "Unpacked the archive and combined everything inside."
                  : null)
              }
              noteAction={resultNote?.action}
              filesCombined={filesCombined}
              tokens={tokens}
              noiseSkipped={noiseSkipped}
              outputStyle={config.outputStyle}
              onOutputStyleChange={(style) => setConfig({ outputStyle: style })}
              isCopied={output.isCopied}
              isGenerating={output.isGenerating}
              onCopy={output.copy}
              onDownload={output.download}
              onStartOver={startOver}
              onAddFiles={onAddFiles}
              previewText={previewText}
              unsupported={notText}
              skippedByDefault={skippedByDefault}
              flaggedFiles={flaggedFiles}
              extractedFiles={extractedFiles}
              partialDocuments={partialDocuments}
              scannedDocumentCount={
                ingestion.scannedDocuments.length - recognition.imageCount
              }
              imageCount={recognition.imageCount}
              recognisedImages={recognition.recognisedImages}
              isReading={ingestion.isReading}
              readProgress={ingestion.readProgress}
              recoveredDocuments={
                ingestion.recoveredDocuments - recognition.recognisedImages
              }
              stoppedReading={ingestion.stoppedReading}
              readLanguageNote={readLanguageNote}
              onCheckReading={() => setReadingOpen(true)}
              onAdjust={() => openSettings()}
              onChangeModel={() => openSettings(true)}
              bigBundle={bigBundle}
              weight={weight}
              splitMode={output.selectedFormat}
              onSplitModeChange={(mode) => setConfig({ defaultOutputFormat: mode })}
            />
          ))}
      </main>

      {phase === "landing" && <SiteFooter />}

      {/* Mounted alongside the result, not inside the card that opens it: a
          pass started here keeps running while the dialog is closed, and the
          card's own state has to be free to change underneath. */}
      <ReadingDialog
        open={readingOpen}
        onOpenChange={setReadingOpen}
        documents={readingDocuments}
        language={readLocale}
        languageOptions={languageOptions}
        isReading={ingestion.isReading}
        progress={ingestion.readProgress}
        onRead={ingestion.readSelected}
        onStop={ingestion.stopReading}
      />

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
        modelPicker={modelPicker}
        focusModel={settingsFocusModel}
      />
    </div>
  );
}
