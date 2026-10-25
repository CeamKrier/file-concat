import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Archive } from "lucide-react";
import {
  DEFAULT_CONFIG,
  MULTI_OUTPUT_LIMIT,
  SPLIT_OUTPUT_ENABLED,
  addLineNumbers,
  assembleOutputHead,
  formatSize,
  generateFileTree,
  generateProjectName,
  summarizeExclusions,
  type AssembleOutputOptions,
  type ExcludedSummary,
  type OutputStyle,
} from "@fileconcat/core";

import { useConfig } from "~/hooks/use-config";
import { useClipperPush } from "~/hooks/use-clipper-push";
import { useFileIngestion } from "~/hooks/use-file-ingestion";
import { useFilterState } from "~/hooks/use-filter-state";
import { useOutputGeneration } from "~/hooks/use-output-generation";
import { estimateBundleTokens, preloadTokenEstimator } from "~/lib/tokens";
import { weighBundle } from "~/lib/bundle-weight";
import { useSelectedModel } from "~/hooks/use-selected-model";
import { classifyUrl, type Classification, type ImportTab } from "~/lib/classify-url";
import { friendlyFetchError, type ImportError } from "~/lib/fetch-error";
import {
  addToTally,
  currentRun,
  track,
  trackAmount,
  trackEntrySurface,
  trackTally,
  type Tally,
} from "~/lib/metrics";
import { tagSurface } from "~/lib/clarity-tags";
import { encodingWhy } from "~/lib/encoding-guess";
import { cn } from "~/lib/utils";
import {
  browserLanguageWithoutReader,
  browserOcrLanguage,
  ocrLanguageName,
  ocrLanguageOptions,
} from "~/lib/ocr-language";
import {
  beginCurate,
  endCurate,
  flushTreeInteractions,
} from "~/components/file-tree/interaction-tally";

import { MarketingSections, SiteFooter } from "./marketing";

import { TopBar } from "./top-bar";
import { LandingHero } from "./landing-hero";
import type { DropZoneProps } from "./drop-zone";
import type { ImportState } from "./import-panel";
import { ProcessingView, type ProcessingStep } from "./processing-view";
import { PREVIEW_LIMIT, ResultView } from "./result-view";
import { ResultEmpty } from "./result-empty";
import { EncodingPicker } from "./encoding-picker";
import { FeedbackDock } from "./feedback-dock";
import { ReadingDialog } from "./reading-dialog";
import { offersFor, passOutcome } from "./reading-bar";
import { emptyKindFor, emptyReasonSlug, unreadableGroups } from "./empty-kind";
import {
  isRecognisableImage,
  isSpeechMedia,
  STAGE,
  type ContentEntry,
  type IncomingFile,
} from "~/hooks/use-file-ingestion";
import { SettingsDrawer } from "./settings-drawer";
import { FilesPane } from "./files-pane";

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

/** The one bundle description the preview renders and the estimate counts. */
function bundleOptions(
  files: ContentEntry[],
  style: OutputStyle,
  source: string | undefined,
  excluded: ExcludedSummary,
): AssembleOutputOptions {
  const paths = files.map((f) => f.path);
  return {
    projectName: generateProjectName(paths, source),
    files,
    tree: generateFileTree(paths),
    style,
    source,
    excluded,
  };
}

type AppFlowProps = {
  /**
   * Replace the default landing (home hero + marketing sections) with custom
   * content — used by the persona routes to host the same flow under their own
   * hero. Receives the wired drop handlers so an embedded DropZone starts the
   * flow in place. When omitted, the home landing renders. Processing, result,
   * TopBar, and the settings drawer are unaffected either way.
   *
   * The link-import state comes second. Persona heroes ignore it, since a repo
   * field under a hero about a folder of case files is clutter (see
   * `ImportPanel`); a page about a remote source renders it above the fold.
   */
  renderLanding?: (dropProps: DropZoneProps, linkImport: ImportState) => React.ReactNode;
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
    trackEntrySurface(window.location.pathname, document.referrer, window.location.search);
    tagSurface(window.location.pathname);
  }, []);

  const [phase, setPhase] = useState<Phase>("landing");
  // The model sheet, opened from the model name in the fit line.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The Files pane: what goes in the bundle, beside the live result.
  const [filesOpen, setFilesOpen] = useState(false);
  // `drawer_opened` keeps its name and doors so its series stays continuous
  // across the move from one drawer to the pane and the model sheet.
  const openSettings = () => {
    setSettingsOpen(true);
    track("drawer_opened", "model");
  };
  const openFiles = (door: "adjust" | "empty") => {
    if (!filesOpen) beginCurate();
    setFilesOpen(true);
    track("drawer_opened", door);
  };
  const [readingOpen, setReadingOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** Successful exports this page load; the feedback ask waits on the first. */
  const [exports, setExports] = useState(0);
  // The source identity shown under the spinner (import slug/host, else "").
  const [processingLabel, setProcessingLabel] = useState("");

  // Import. Kept here, above the phase switch, so a failed fetch can return to
  // landing with the URL and a friendly note intact. The hero unmounts during
  // processing, and there is no open/closed state any more: the row is always
  // visible under the drop target, on every landing (see `ImportPanel`).
  const [importTab, setImportTab] = useState<ImportTab>("github");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [resultNote, setResultNote] = useState<ResultNote | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  // --- engine derivations (mirrors the legacy orchestrator) -----------------
  // The tree answers a toggle with the new selection at once; everything built
  // from the whole bundle (contents, preview, token count) follows in a render
  // React may interrupt, a step behind (useDeferredValue). On a big drop that
  // work is most of a second, and it used to hold the click until it finished.
  // Only a toggle is deferred. Statuses deferred across a new drop or append
  // are not a step behind, they belong to another bundle: the result screen
  // showed "0 tokens" or the last bundle's count for that render.
  const live = useMemo(
    () => ({ entries: ingestion.entries, statuses: filter.fileStatuses }),
    [ingestion.entries, filter.fileStatuses],
  );
  const deferred = useDeferredValue(live);
  const settled = deferred.entries === live.entries ? deferred : live;
  const settledStatuses = settled.statuses;
  const includedContents = useMemo(() => {
    const included = new Set(settledStatuses.filter((s) => s.included).map((s) => s.path));
    const transform = config.showLineNumbers ? addLineNumbers : null;
    return settled.entries
      .filter((e) => included.has(e.path))
      .map((e) => ({
        path: e.path,
        content: transform ? transform(e.content) : e.content,
        recognised: e.recognised,
      }));
  }, [settled.entries, settledStatuses, config.showLineNumbers]);

  // Real content gaps the model can't see in the tree (ADR-0008). Reported in
  // the bundle summary; noise and user-deselected files are never listed.
  // A document in the bundle that its reader got only part of is named with
  // what is missing, so a question about page 5 is not answered as if page 5
  // were blank (Q7 O1).
  const excluded = useMemo(() => {
    // A file a running pass has not reached is named as not read yet, never as
    // a file the tool could not read (Q7 O2).
    const pending = new Set(ingestion.pendingReads);
    const summary = summarizeExclusions(settledStatuses.filter((s) => !pending.has(s.path)));
    const included = new Set(settledStatuses.filter((s) => s.included).map((s) => s.path));
    const partial = Object.entries(ingestion.validations)
      .filter(([path, v]) => included.has(path) && v.notes?.length)
      .map(([path, v]) => ({ path, notes: v.notes ?? [] }));
    return {
      ...summary,
      ...(partial.length ? { partial } : {}),
      ...(pending.size ? { pending: [...pending] } : {}),
    };
  }, [settledStatuses, ingestion.validations, ingestion.pendingReads]);

  const [estimatorReady, setEstimatorReady] = useState(false);
  useEffect(() => {
    void preloadTokenEstimator().then(() => setEstimatorReady(true));
  }, []);
  const bundle = useMemo(
    () =>
      bundleOptions(
        includedContents,
        config.outputStyle,
        ingestion.sourceUrl ?? undefined,
        excluded,
      ),
    [includedContents, config.outputStyle, ingestion.sourceUrl, excluded],
  );

  // Only the head is shown, so only the head is assembled (see
  // `assembleOutputHead`); its length is not the bundle's.
  const previewText = useMemo(
    () => (includedContents.length === 0 ? "" : assembleOutputHead(bundle, PREVIEW_LIMIT)),
    [bundle, includedContents],
  );

  // Count the artifact, not the raw file contents. The wrapper, the header and
  // the file tree are all sent to the model and all charged for. Measured on
  // 2026-09-07 over 60 public repositories, counting contents alone reported a
  // median 2.4% under what a paste actually costs, and 17.8% under on a
  // repository of many small files, where the per-file tags outweigh them.
  //
  // Counted in two pieces rather than over `previewText`, so that flipping the
  // output style moves the number by what the style actually costs. See
  // `estimateBundleTokens`.
  const tokens = useMemo(() => {
    return estimateBundleTokens(bundle);
    // estimatorReady is a recompute trigger once tiktoken loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, estimatorReady]);

  const output = useOutputGeneration({
    includedContents,
    excluded,
    tokens,
    sourceUrl: ingestion.sourceUrl,
    outputStyle: config.outputStyle,
    formatPreference: config.defaultOutputFormat,
    chunkSizeKB: config.chunkSizeKB,
  });

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
        notText.push({ name, why: reason || "Not text" });
      }
    }
    for (const f of ingestion.failedFiles) {
      notText.push({ name: f.path.split("/").pop() ?? f.path, why: f.error });
    }
    return { notText, skippedByDefault };
  }, [ingestion.validations, ingestion.failedFiles, ingestion.unreadDocuments]);
  // "Noise" = valid text excluded by ignore patterns — not the non-text files
  // above. The paths, not just the count: the result screen states the count and
  // opens the list behind it, and "212 files were skipped for you" is a claim
  // that has to be checkable.
  const noiseFiles = useMemo(() => {
    const rejected = new Set(
      Object.entries(ingestion.validations)
        .filter(([, v]) => !v.included)
        .map(([p]) => p),
    );
    return settledStatuses
      .filter((s) => !s.included && !rejected.has(s.path))
      .map((s) => s.path);
  }, [settledStatuses, ingestion.validations]);
  // Included files read in an encoding nothing in them named, or cut where
  // binary data starts: kept in, flagged for a look, each with its reason and,
  // for the encoding, a picker to read it again in another.
  const { decodeFileAs } = ingestion;
  const flaggedFiles = useMemo(() => {
    const included = new Set(settledStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(
        ([path, v]) =>
          included.has(path) &&
          (v.classification === "ambiguous" || v.guessed || v.notes?.some((n) => n.kind === "binary-tail")),
      )
      .map(([path, v]) => {
        const name = path.split("/").pop() ?? path;
        const cut = v.notes?.find((n) => n.kind === "binary-tail");
        const why = [
          cut && `Stopped at ${formatSize(cut.count ?? 0)}: binary data follows.`,
          v.encoding && encodingWhy(v.encoding, v.guessed === "picked"),
        ]
          .filter(Boolean)
          .join(" ");
        const action = v.encoding ? (
          <EncodingPicker name={name} value={v.encoding} onPick={(label) => void decodeFileAs(path, label)} />
        ) : undefined;
        return { name, why: why || undefined, action };
      });
  }, [ingestion.validations, settledStatuses, decodeFileAs]);
  // Included files whose text was extracted from a document (PDF/Office/ODF).
  const extractedFiles = useMemo(() => {
    const included = new Set(settledStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(([path, v]) => v.extracted && included.has(path))
      .map(([path]) => path.split("/").pop() ?? path);
  }, [ingestion.validations, settledStatuses]);
  // Included documents that lost whole pages. The reader says so (ADR-0008) and
  // until now nobody read it, so a PDF missing three pages reached the bundle
  // looking exactly like one missing none.
  //
  // Hidden text the reader left out on purpose (Q18 O1) is listed the same
  // way: what is in the bundle is real, and something the file holds is not.
  //
  // Only these two kinds, out of the rest. `ocr-failed` is what the scanned documents
  // card is already about, and `parser-unavailable` / `cdn-fallback` describe a
  // file that produced no text at all, which is not in the bundle to caveat.
  // `attachments-skipped` is the one deliberately left out: it is honest, but a
  // notebook emits it for every markdown cell holding an image, and notebooks
  // are the second most extracted format here — so the card would fire mostly
  // on drops where nothing is wrong, and a caveat that is usually noise is one
  // nobody reads on the day it matters. Every kind still reaches `extract_note`,
  // so nothing is lost, it just goes to the counters instead of the screen.
  const partialDocuments = useMemo(() => {
    const included = new Set(settledStatuses.filter((s) => s.included).map((s) => s.path));
    return Object.entries(ingestion.validations)
      .filter(([path, v]) => included.has(path) && v.notes?.some((n) => n.kind === "pages-skipped" || n.kind === "hidden-left-out"))
      .map(([path, v]) => ({
        name: path.split("/").pop() ?? path,
        why: v.notes?.some((n) => n.kind === "pages-skipped") ? "pages missing" : "hidden text left out",
      }));
  }, [ingestion.validations, settledStatuses]);
  const bigBundle = SPLIT_OUTPUT_ENABLED && tokens > MULTI_OUTPUT_LIMIT;
  // What the removed 32 MB per-file cap used to decide silently, reported
  // instead. Measured over the files that actually made the bundle, so
  // deselecting the heavy one in the drawer visibly moves it.
  // Text length per file, for the Files pane's shares. Aligned with
  // `fileStatuses`, which is derived from `entries` index for index.
  const entryChars = useMemo(
    () => ingestion.entries.map((e) => e.content.length),
    [ingestion.entries],
  );
  const showFiles = filesOpen && phase === "result";
  const weight = useMemo(
    () =>
      weighBundle({
        files: includedContents,
        tokens,
        model: modelPicker.selectedModel
          ? {
              name: modelPicker.selectedModel.name,
              contextLimit: modelPicker.selectedModel.contextLimit,
              inputCost: modelPicker.selectedModel.inputCost,
            }
          : null,
      }),
    [includedContents, tokens, modelPicker.selectedModel],
  );
  const projectName = useMemo(
    () =>
      ingestion.entries.length
        ? generateProjectName(
            ingestion.entries.map((e) => e.path),
            ingestion.sourceUrl ?? undefined,
          )
        : "",
    [ingestion.entries, ingestion.sourceUrl],
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
      settledStatuses.filter((s) => !s.included && s.classification !== "binary").length,
    [settledStatuses],
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
      settledStatuses.some(
        (s) => !s.included && emptyReasonSlug(s.reason) === "include",
      ),
    [settledStatuses],
  );
  /**
   * The two populations recognition can read, told apart by format (ADR-0017).
   * They share every mechanism and differ in one thing: a document's pass starts
   * by itself, so an unread document is a gap, while an unread image is only an
   * offer nobody has taken. One count for both would say neither.
   */
  const recognition = useMemo(() => {
    const isImage = (d: { format: string }) => isRecognisableImage(d.format);
    const isMedia = (d: { format: string }) => isSpeechMedia(d.format);
    // Speech is an offer on the same terms as an image (D5), so it leaves the
    // document counts the same way.
    const isOffer = (d: { format: string }) => isImage(d) || isMedia(d);
    const images = ingestion.scannedDocuments.filter(isImage);
    const unreadImages = ingestion.unreadDocuments.filter(isImage);
    const media = ingestion.scannedDocuments.filter(isMedia);
    const unreadMedia = ingestion.unreadDocuments.filter(isMedia);
    const untried = ingestion.unreadDocuments.filter(
      (d) => !isOffer(d) && ingestion.validations[d.path]?.recognitionTried !== true,
    );
    return {
      imageCount: images.length,
      recognisedImages: images.length - unreadImages.length,
      mediaCount: media.length,
      recognisedMedia: media.length - unreadMedia.length,
      offerableMediaCount: unreadMedia.filter(
        (d) => ingestion.validations[d.path]?.recognitionTried !== true,
      ).length,
      unreadDocumentCount: ingestion.unreadDocuments.filter((d) => !isOffer(d)).length,
      // Only the ones no pass has been over yet. Once recognition has looked and
      // found nothing, the offer is spent and the empty screen says so instead.
      offerableImageCount: unreadImages.filter(
        (d) => ingestion.validations[d.path]?.recognitionTried !== true,
      ).length,
      // The document half of the same question, and the reason a big drop can
      // hand its bundle back without lying about the scans in it: "never tried"
      // and "tried and got nothing" want opposite copy, and only the
      // per-document record can still tell them apart after an append.
      untriedDocumentCount: untried.length,
      // What the reading bar offers, by kind: only what no pass has been over.
      offerPaths: {
        images: unreadImages.filter((d) => ingestion.validations[d.path]?.recognitionTried !== true).map((d) => d.path),
        speech: unreadMedia.filter((d) => ingestion.validations[d.path]?.recognitionTried !== true).map((d) => d.path),
        scans: untried.map((d) => d.path),
      },
      // What the deferred row states as the scope of the offer (Q112 O1): how
      // many had their first pages read anyway, and the pages still to read.
      // Null when a document's pages are unknown, so no total is made up.
      deferredScope: {
        previewed: untried.filter((d) => d.previewed).length,
        pagesLeft: untried.every((d) => d.pages?.length)
          ? untried.reduce((sum, d) => sum + (d.pages?.length ?? 0), 0)
          : null,
      },
    };
  }, [ingestion.scannedDocuments, ingestion.unreadDocuments, ingestion.validations]);

  // A stop outranks it. The untouched tail of a stopped pass is untried too,
  // and "stopped, with N unread" is the more specific of the two things to say.
  const readDeferred = recognition.untriedDocumentCount > 0 && !ingestion.stoppedReading;

  // Whether a bundle was taken while a pass ran, so taking it again once the
  // pass is over can be counted (output_retaken_after_pass). It says whether
  // export-during-a-pass is used and then redone, which is the cost of Q7 O2.
  const exportedDuringPass = useRef(false);
  const noteExport = (kind: "copy" | "download" | "share") => {
    setExports((n) => n + 1);
    if (ingestion.isReading) exportedDuringPass.current = true;
    else if (exportedDuringPass.current) {
      exportedDuringPass.current = false;
      track("output_retaken_after_pass", kind);
    }
  };

  const emptyKind = useMemo(
    () =>
      emptyKindFor(
        droppedFiles,
        recognition.unreadDocumentCount,
        adjustableCount,
        recognition.offerableImageCount,
        ingestion.pruned?.count ?? 0,
        recognition.offerableMediaCount,
      ),
    [droppedFiles, recognition, adjustableCount, ingestion.pruned],
  );
  const unreadable = useMemo(
    () => unreadableGroups(ingestion.validations, ingestion.failedFiles),
    [ingestion.validations, ingestion.failedFiles],
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
   *
   * Empty is judged on `filesCombined` and the live statuses, the values the
   * screen itself renders from. `includedContents` once followed them a render
   * behind on every drop (`useDeferredValue`), and from 2026-10-17 to 10-18
   * that wrote these rows beside a `bundle_size`.
   */
  const emptiedRun = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "result" || filesCombined > 0) return;
    const paths = Object.keys(ingestion.validations);
    if (paths.length === 0) return;
    const run = currentRun();
    if (run === null || run === emptiedRun.current) return;
    emptiedRun.current = run;

    const statuses = new Map(filter.fileStatuses.map((s) => [s.path, s]));
    const tally: Tally = new Map();
    for (const path of paths) {
      const reason = statuses.get(path)?.reason ?? ingestion.validations[path]?.reason;
      addToTally(tally, emptyReasonSlug(reason, ingestion.validations[path]?.classification));
    }
    trackTally("empty_reason", tally);
    // The title the screen showed, and for a drop nothing could read, why
    // each file could not be: the per-file list's own groups, counted.
    const listed = emptyKind === "other" && unreadable.length > 0;
    track("empty_kind", listed ? "unreadable" : emptyKind);
    if (listed) {
      const codes: Tally = new Map();
      for (const group of unreadable) codes.set(group.code, { n: group.files.length });
      trackTally("unreadable_reason", codes);
    }
  }, [phase, filesCombined, filter.fileStatuses, ingestion.validations, emptyKind, unreadable]);

  /**
   * Files someone moved by hand in the tree, recorded when the Files pane
   * closes or the page is hidden with it open.
   *
   * Deliberately not a mirror of the effect above. That one fires as the result
   * phase opens, which is before anyone has touched anything, so the same shape
   * here would read zero every time. Every curation control lives inside the
   * Files pane, which makes closing it the end of an editing session and the
   * only honest Run-scoped boundary the flow offers.
   *
   * A reopen writes the increase since the last close rather than the whole
   * count again, so SUM(n) over a Run is the high-water mark of manual overrides
   * while the Run count stays "Runs where anyone trimmed at all" - which is the
   * rate, over Runs carrying a `bundle_size` row. A Run nobody trimmed writes
   * nothing.
   */
  const trimmed = useRef({ run: -1, include: 0, exclude: 0 });
  // Read from the visibility listener, which outlives the render it was made in.
  const overridesNow = useRef(filter.manualOverrides);
  overridesNow.current = filter.manualOverrides;
  const endEditing = useCallback((how: "closed" | "left") => {
    const run = currentRun();
    if (run !== null) {
      if (trimmed.current.run !== run) trimmed.current = { run, include: 0, exclude: 0 };
      for (const side of ["include", "exclude"] as const) {
        const delta = overridesNow.current[side] - trimmed.current[side];
        if (delta <= 0) continue;
        trimmed.current[side] = overridesNow.current[side];
        trackAmount("tree_edit", { value: side, n: delta });
      }
    }
    // Which control did the moving, and whether a folder sweep was undone on
    // the spot. `tree_edit` counts files and cannot answer either.
    flushTreeInteractions();
    endCurate(how);
  }, []);
  const closeFiles = useCallback(() => {
    setFilesOpen(false);
    endEditing("closed");
  }, [endEditing]);
  // Closing the tab with the panel open is the session nobody finished, and it
  // used to write nothing at all. Coming back starts a new one.
  useEffect(() => {
    if (!filesOpen) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") endEditing("left");
      else beginCurate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [filesOpen, endEditing]);

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

  // Honest progress, straight from the ingestion engine.
  const progress = ingestion.progress;
  // The engine's live stage note wins as the heading (Connecting → Listing →
  // Downloading), falling back to the phase name once files start streaming.
  const isRecognising = progress?.phase === "recognising";
  // Built once: sixty entries through Intl.DisplayNames and a sort, for a
  // control most drops never render.
  const languageOptions = useMemo(() => ocrLanguageOptions(), []);
  // The tag a pass ran under is whatever the browser reported (`tr-TR`), while
  // the control offers one canonical tag per model (`tr`). Matching on the model
  // is what keeps the select from rendering blank on a tag it has no option for.
  // Before any pass, the browser's language: a recording is never read on its
  // own, so its first pass starts here, and English would hand a Turkish talk
  // to the English-only speech model.
  const passLanguage = ingestion.readLanguage ?? browserOcrLanguage();
  const readLocale = languageOptions.find((o) => o.code === passLanguage.code)?.locale ?? null;

  const readingOffers = offersFor(
    recognition.offerPaths,
    recognition.deferredScope,
    ingestion.stoppedReading,
    (paths) => void ingestion.readSelected(paths, readLocale ?? passLanguage.locale),
  );
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
        speech: isSpeechMedia(d.format),
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
      : // A stage with no total to count towards still has a count: the folder
        // walk says how many files it has found so far rather than nothing.
        progress && progress.done > 0
        ? `${progress.done} files found`
        : processingLabel;
  // The one stage measured in seconds a page rather than files a second, and
  // the only one anyone would want out of. Say what it is buying before they
  // decide.
  /**
   * Where the run has got to among its stages. The active one is the stage
   * whose note the engine is showing; a remote fetch narrates its own
   * sub-stages (Connecting, Downloading files), so it is placed by phase
   * instead. An unplaceable note leaves the first stage active rather than
   * ticking rows that have not run.
   */
  const activeStage =
    progress?.phase === "fetching"
      ? STAGE.fetch
      : progress?.phase === "recognising"
        ? STAGE.recognise
        : progress?.note;
  const processingSteps = useMemo(() => {
    const stages = progress?.stages;
    if (!stages) return undefined;
    const active = Math.max(stages.indexOf(activeStage ?? ""), 0);
    return stages.map(
      (label, i): ProcessingStep => ({
        // The heading keeps the trailing dots; a stage sitting in a list is not
        // saying it is under way, and a ticked one is saying the opposite.
        label: label.replace(/\.\.\.$/, ""),
        state: i === active ? "active" : i < active ? "done" : "pending",
      }),
    );
  }, [progress?.stages, activeStage]);
  /**
   * The stage the rail is showing as active, so the heading above it can stand
   * down. Saying "Preparing files..." in 22px directly over a rail row reading
   * "Preparing files" is the same words twice; a fetch keeps its heading
   * because its sub-stage is a different fact from the stage it sits in.
   */
  const activeStepLabel = processingSteps?.find((s) => s.state === "active")?.label;
  const processingAside = isRecognising
    ? "These pages are pictures, not text. Recognition reads the pixels here in your browser, which takes a few seconds a page."
    : undefined;

  const startOver = useCallback(() => {
    if (filesOpen) closeFiles();
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
  }, [ingestion, filter, output, filesOpen, closeFiles]);

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
                setResultNote({ text: "Kept only the clippings from this push." });
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
    // Unreachable from the UI, and kept as the guard it always was.
    // `ImportPanel` disables Fetch for exactly these kinds, so nothing presses
    // through to here. That is why `import_failed(bad|binary)` is counted at
    // the panel's blur instead: there is no press to hang it on, and the
    // attempt writes no `source_used` either, so without that it is absent
    // from the data entirely rather than merely unexplained.
    if (c.kind === "empty" || c.kind === "bad") {
      setImportError({
        message: "That doesn't look like a link yet. Paste a public repo, Gist, or page URL.",
      });
      return;
    }
    if (c.kind === "binary") {
      setImportError({
        message: `That link points to a ${c.fileType} file, which can't be read as text. Try a repo, a Gist, or a page with text.`,
      });
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
        const failure = friendlyFetchError(error, c);
        if (failure !== null) track("import_failed", `fetch/${failure.reason}`);
        setPhase("landing");
        setResultNote(null);
        setImportError(failure);
      }
    })();
  }, [importUrl, importTab, begin, ingestion]);

  const linkImport: ImportState = {
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
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <TopBar onStartOver={startOver} />

      {/* Room for the feedback panel rather than a panel over the work: the
          bundle it is about stays readable beside it. */}
      <main
        className={cn(
          "ease-out-expo flex-1 transition-[padding] duration-300 motion-reduce:transition-none",
          feedbackOpen && "max-lg:pb-[448px] lg:pr-[400px]",
          // Room for the Files pane on the left, the same way, so the result
          // beside it stays readable and live.
          showFiles && "lg:pl-[420px]",
        )}
      >
        {phase === "landing" &&
          (renderLanding ? (
            renderLanding(dropProps, linkImport)
          ) : (
            <>
              <LandingHero {...dropProps} linkImport={linkImport} />
              <div className="mt-16">
                <MarketingSections />
              </div>
            </>
          ))}

        {phase === "processing" && (
          <ProcessingView
            heading={
              processingHeading.replace(/\.\.\.$/, "") === activeStepLabel ? "" : processingHeading
            }
            detail={processingDetail}
            aside={processingAside}
            onStop={isRecognising ? ingestion.stopReading : undefined}
            stopLabel="Skip the scanned pages"
            stopping={ingestion.isStopping}
            steps={processingSteps}
          />
        )}

        {phase === "result" &&
          (filesCombined === 0 ? (
            <ResultEmpty
              droppedFiles={droppedFiles}
              kind={emptyKind}
              pruned={ingestion.pruned}
              unreadable={unreadable}
              onStartOver={startOver}
              onAdjust={adjustableCount > 0 ? () => openFiles("empty") : undefined}
              byInclude={excludedByInclude}
              isReading={ingestion.isReading}
              readProgress={ingestion.readProgress}
              stoppedReading={ingestion.stoppedReading}
              isStopping={ingestion.isStopping}
              readDeferred={readDeferred}
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
              noteIcon={!resultNote && ingestion.expandedArchive ? Archive : undefined}
              filesCombined={filesCombined}
              totalFiles={settledStatuses.length}
              tokens={tokens}
              noiseFiles={noiseFiles}
              pruned={ingestion.pruned}
              outputStyle={config.outputStyle}
              onOutputStyleChange={(style) => setConfig({ outputStyle: style })}
              isCopied={output.isCopied}
              isGenerating={output.isGenerating}
              onCopy={async () => {
                if (await output.copy()) noteExport("copy");
              }}
              onDownload={async () => {
                if (await output.download()) noteExport("download");
              }}
              onShare={
                output.canShareFiles
                  ? async () => {
                      if (await output.share()) noteExport("share");
                    }
                  : undefined
              }
              onFeedback={() => setFeedbackOpen(true)}
              onStartOver={startOver}
              onAddFiles={onAddFiles}
              previewText={previewText}
              unsupported={notText}
              skippedByDefault={skippedByDefault}
              flaggedFiles={flaggedFiles}
              extractedFiles={extractedFiles}
              partialDocuments={partialDocuments}
              scannedDocumentCount={
                ingestion.scannedDocuments.length - recognition.imageCount - recognition.mediaCount
              }
              imageCount={recognition.imageCount}
              recognisedImages={recognition.recognisedImages}
              mediaCount={recognition.mediaCount}
              recognisedMedia={recognition.recognisedMedia}
              isReading={ingestion.isReading}
              reading={{
                isReading: ingestion.isReading,
                progress: ingestion.readProgress,
                isStopping: ingestion.isStopping,
                onStop: ingestion.stopReading,
                offers: readingOffers,
                outcome: passOutcome(ingestion.lastPass, ingestion.stoppedReading),
                language: {
                  name: ocrLanguageName(passLanguage),
                  fallback: !ingestion.readLanguage && browserLanguageWithoutReader() !== null,
                  onChange: () => setReadingOpen(true),
                },
              }}
              recoveredDocuments={
                ingestion.recoveredDocuments -
                recognition.recognisedImages -
                recognition.recognisedMedia
              }
              stoppedReading={ingestion.stoppedReading}
              readLanguageNote={readLanguageNote}
              onCheckReading={() => setReadingOpen(true)}
              onAdjust={() => openFiles("adjust")}
              onChangeModel={openSettings}
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
        onRead={ingestion.readSelected}
      />

      <FeedbackDock
        active={phase === "result"}
        exports={exports}
        empty={phase === "result" && filesCombined === 0 && !ingestion.isReading}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />

      {showFiles && (
        <FilesPane
          fileStatuses={filter.fileStatuses}
          chars={entryChars}
          onToggleFile={filter.toggleFile}
          onToggleMany={filter.toggleMany}
          overrides={filter.overrides}
          restoreOverrides={filter.restoreOverrides}
          config={config}
          setConfig={setConfig}
          tokens={tokens}
          fit={weight.fit}
          onClose={closeFiles}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        tokens={tokens}
        modelPicker={modelPicker}
      />
    </div>
  );
}
