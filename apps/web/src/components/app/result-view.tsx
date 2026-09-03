import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChartPie,
  Check,
  ChevronDown,
  Copy,
  Download,
  FilePlus,
  FileX2,
  Filter,
  Gauge,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Weight,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import type { BundleWeight } from "~/lib/bundle-weight";
import { SegmentedControl } from "./segmented-control";

type OutputStyle = "xml" | "markdown" | "plain";
type SplitMode = "single" | "multi";

export type UnsupportedFile = { name: string; why: string };

type ResultViewProps = {
  sourceLabel: string;
  note?: string | null;
  /** The one thing the note can offer to do, shown as a link beside it. */
  noteAction?: { label: string; onClick: () => void };
  /** What the note is about, since only the caller knows. Defaults to `Info`. */
  noteIcon?: LucideIcon;
  filesCombined: number;
  /** Every file the drop presented, included or not. Only rendered when it is
   * larger than `filesCombined`, so a clean drop never says "12 of 12". */
  totalFiles: number;
  tokens: number;
  /** Every file a default ignore rule kept out. The count is the headline and
   * the names are the evidence, so the row takes the list, not a number. */
  noiseFiles: string[];
  outputStyle: OutputStyle;
  onOutputStyleChange: (style: OutputStyle) => void;
  isCopied: boolean;
  isGenerating: boolean;
  onCopy: () => void;
  onDownload: () => void;
  /** Clear all state and return to the landing drop zone. */
  onStartOver: () => void;
  /** Add files to this bundle instead of replacing it. */
  onAddFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  previewText: string;
  /** Genuinely not combinable as text — binaries, archives, unreadable files. */
  unsupported: UnsupportedFile[];
  /** Readable text held back by a default rule. Hidden dotfiles, since the size cap went. */
  skippedByDefault: UnsupportedFile[];
  /** Included files that decoded as "ambiguous" — kept in, but worth a look. */
  flaggedFiles: string[];
  /** Included files whose text was extracted from a document (PDF/Office/ODF). */
  extractedFiles: string[];
  /** Included documents that lost whole pages on the way out, and what is missing. */
  partialDocuments: UnsupportedFile[];
  /** Every document in this Run that opened with no text in it, recovered or not. */
  scannedDocumentCount: number;
  /** Images in this Run recognition could be offered over, read or not. */
  imageCount: number;
  /** How many of those a pass has already read. */
  recognisedImages: number;
  /** True while a recognition pass is running. */
  isReading: boolean;
  /** Recognition progress, or null when idle. */
  readProgress: { done: number; total: number } | null;
  /** True between the stop being asked for and the pass ending. */
  isStopping: boolean;
  /** End the pass now and release the export with whatever has been read. */
  onStopReading: () => void;
  /** How many documents recognition has already rescued in this Run. */
  recoveredDocuments: number;
  /** True when the last recognition pass ended on a stop rather than on its own. */
  stoppedReading: boolean;
  /** True when no pass has been started over the scans at all, because the drop
   * was too big to read unasked. */
  readDeferred: boolean;
  /** How to attribute the reading, already phrased: "as Turkish", "in 2 languages". */
  readLanguageNote: string | null;
  /** Open the reading dialog, where every recognition action lives. */
  onCheckReading: () => void;
  /** Open the "Adjust what's included" drawer. */
  onAdjust: () => void;
  /** Open the same drawer, scrolled to the model picker. */
  onChangeModel: () => void;
  bigBundle: boolean;
  /** How heavy the bundle turned out, on both the model and browser axes. */
  weight: BundleWeight;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
};

const fmt = new Intl.NumberFormat("en-US");
const PREVIEW_LIMIT = 4000;
const STYLE_LABEL: Record<OutputStyle, string> = {
  xml: "xml",
  markdown: "markdown",
  plain: "plain",
};

/**
 * One row of the ledger: what the tool knows about the bundle, in one grammar.
 *
 * `kind` is the whole severity scale, and two tiers is the whole of it. A gap
 * means something is missing from the bundle or will not fit where it is going;
 * a note means the bundle is intact and there is something worth knowing. The
 * mark carries a shape and a label as well as a colour, because status on this
 * screen decides whether someone re-reads a file before trusting an answer.
 *
 * `icon` names the subject, never the severity: the container around it is what
 * says gap or note, so a row can look like what it is about and still be read
 * as one of two tiers in greyscale.
 */
type LedgerRow = {
  key: string;
  kind: "gap" | "note";
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  /** The one door out of the row, when there is one. */
  action?: { label: string; onClick: () => void };
  /** Evidence for the row's own claim, behind a toggle that names it. */
  panel?: { label: string; content: ReactNode };
};

export function ResultView({
  sourceLabel,
  note,
  noteAction,
  noteIcon,
  filesCombined,
  totalFiles,
  tokens,
  noiseFiles,
  outputStyle,
  onOutputStyleChange,
  isCopied,
  isGenerating,
  onCopy,
  onDownload,
  onStartOver,
  onAddFiles,
  previewText,
  unsupported,
  skippedByDefault,
  flaggedFiles,
  extractedFiles,
  partialDocuments,
  scannedDocumentCount,
  imageCount,
  recognisedImages,
  isReading,
  readProgress,
  isStopping,
  onStopReading,
  recoveredDocuments,
  stoppedReading,
  readDeferred,
  readLanguageNote,
  onCheckReading,
  onAdjust,
  onChangeModel,
  bigBundle,
  weight,
  splitMode,
  onSplitModeChange,
}: ResultViewProps) {
  // A hidden input behind a real button, the same idiom the drop zone uses: the
  // native file picker with a label we control.
  const addInput = useRef<HTMLInputElement>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const truncated = previewText.length > PREVIEW_LIMIT;
  const preview = truncated ? previewText.slice(0, PREVIEW_LIMIT) + "\n..." : previewText;

  const fit = weight.fit;
  const over = fit?.level === "over";
  const tight = fit?.level === "tight";

  // --- the ledger -----------------------------------------------------------
  // Built as data so the header can count it honestly, and so gaps can precede
  // notes without the JSX being written twice. Order inside each tier is the
  // order the facts get acted on: what stops the paste, then what is missing
  // from it, then what is merely worth knowing.
  const noiseSkipped = noiseFiles.length;
  const rows: LedgerRow[] = [];

  if (over && fit) {
    rows.push({
      key: "context",
      kind: "gap",
      icon: Gauge,
      title: `The bundle is ${fit.ratio.toFixed(1)}x the context window of ${fit.modelName}.`,
      body: `About ${fit.ratio.toFixed(1)}x the ${fmt.format(fit.contextLimit)} tokens it can hold at once. Hand it over as a file rather than a paste, pick a model with a bigger window, or leave some files out.`,
      // Only offered when there is a control to move: the split segments live in
      // the export block above, and pointing at a control that is not rendered
      // would be a dead end.
      action: bigBundle
        ? { label: "Split into parts", onClick: () => onSplitModeChange("multi") }
        : undefined,
    });
  }

  // Scans are the one "left out" case with a remedy, so they get a row of their
  // own rather than a chip in the file groups: a file silently contributing
  // nothing is the kind of thing the tool should say out loud. The row states
  // the outcome and opens the door; every recognition control lives in the
  // reading dialog, because the one thing you need before changing a language is
  // the text that language produced, and the text is in there.
  //
  // Suppressed while a pass runs — the reading card above says it better, with
  // a clock.
  if (scannedDocumentCount > 0 && !isReading) {
    const total = scannedDocumentCount;
    const left = total - recoveredDocuments;
    const noun = (n: number) => (n === 1 ? "document" : "documents");
    const asLanguage = readLanguageNote ? ` ${readLanguageNote}` : "";
    if (recoveredDocuments === total) {
      rows.push({
        key: "scans",
        kind: "note",
        icon: ScanText,
        title: `Read ${recoveredDocuments} ${noun(recoveredDocuments)}${asLanguage}.`,
        body: "Recognition guesses at characters, and a reading in the wrong language comes back looking like a success. Worth a look before you trust it.",
        action: { label: "Check the reading", onClick: onCheckReading },
      });
    } else if (recoveredDocuments > 0) {
      rows.push({
        key: "scans",
        kind: "gap",
        icon: ScanText,
        title: `Read ${recoveredDocuments} of ${total} documents${asLanguage}.`,
        body: stoppedReading
          ? `The page in hand finished, and everything read before you stopped is in the bundle. The other ${left} ${noun(left)} ${left === 1 ? "is" : "are"} still out.`
          : `Nothing legible came back from the other ${left}. Another language is the thing worth ruling out.`,
        action: { label: "Check the reading", onClick: onCheckReading },
      });
    } else if (readDeferred) {
      // Never tried, because trying would have held this bundle behind a wait
      // nobody agreed to. Framed as an offer: nothing has gone wrong, and the
      // copy must not imply recognition looked and failed.
      rows.push({
        key: "scans",
        kind: "gap",
        icon: ScanText,
        title: `${total} ${noun(total)} not read yet.`,
        body: "Recognition can read the pages as pictures, a few seconds a page. This drop is large enough that the bundle came first and the reading waits for you to ask.",
        action: { label: "Read them", onClick: onCheckReading },
      });
    } else if (stoppedReading) {
      rows.push({
        key: "scans",
        kind: "gap",
        icon: ScanText,
        title: `Stopped, with ${total} ${noun(total)} unread.`,
        body: `Recognition never got to ${total === 1 ? "it" : "them"}, so ${total === 1 ? "it holds" : "they hold"} nothing yet.`,
        action: { label: "Read them", onClick: onCheckReading },
      });
    } else {
      rows.push({
        key: "scans",
        kind: "gap",
        icon: ScanText,
        title: `${total} ${noun(total)} couldn't be read.`,
        body: `Recognition found no writing in ${total === 1 ? "it" : "them"} either. That usually means the ${noun(total)} ${total === 1 ? "is" : "are"} encrypted, the pages really are blank, or the language was wrong.`,
        action: { label: "Try another language", onClick: onCheckReading },
      });
    }
  }

  if (tight && fit) {
    rows.push({
      key: "tight",
      kind: "note",
      icon: Gauge,
      title: `Fills most of ${fit.modelName}'s context window.`,
      body: `That leaves roughly ${fmt.format(Math.max(0, Math.round(fit.contextLimit * (1 - fit.ratio))))} tokens for your own prompt and the reply. The count is an estimate, so read this as close rather than certain.`,
    });
  }

  // The size fact only earns a row when the fit rows are not already carrying
  // it. Where the figure above says "estimated from character count", the row
  // would be the same sentence twice.
  if (weight.isLarge && !over && !tight) {
    rows.push({
      key: "large",
      kind: "note",
      icon: Weight,
      title: "A big bundle for one paste.",
      body: "Past 1 MB the token figure comes from the character count rather than the tokenizer, and Copy can take a moment.",
    });
  }

  if (weight.dominant) {
    rows.push({
      key: "dominant",
      kind: "note",
      icon: ChartPie,
      // Floored, not rounded: a 99.9% share alongside two other files must not
      // print as "100% of it".
      title: `One file is ${Math.floor(weight.dominant.share * 100)}% of the bundle.`,
      body: "Worth checking that you meant to send it.",
      panel: {
        label: "Which file",
        content: (
          <FileRows
            items={[
              {
                name: weight.dominant.path,
                why: `${Math.floor(weight.dominant.share * 100)}% of the bundle`,
              },
            ]}
          />
        ),
      },
    });
  }

  // Its own row, never folded into the scan count. An image was never promised
  // as text, so it is not a gap in the bundle the way a scan is — it is an
  // offer, and the two must not be read as one number (ADR-0017).
  if (imageCount > 0 && !isReading) {
    const noun = (n: number) => (n === 1 ? "image" : "images");
    if (recognisedImages === 0) {
      rows.push({
        key: "images",
        kind: "note",
        icon: ImageIcon,
        title: `${imageCount} ${noun(imageCount)} might be holding text.`,
        body: "Recognition can read writing off a picture, here in the browser. It is never started for you: a few seconds an image, and only you know whether these are pages or decoration.",
        action: { label: "Read them", onClick: onCheckReading },
      });
    } else {
      rows.push({
        key: "images",
        kind: "note",
        icon: ImageIcon,
        title:
          recognisedImages < imageCount
            ? `Read ${recognisedImages} of ${imageCount} ${noun(imageCount)}.`
            : imageCount === 1
              ? "Read the image."
              : `Read all ${imageCount} images.`,
        body:
          recognisedImages === imageCount
            ? "Recognition guesses at characters, so the words in the bundle are close rather than exact. Worth a look before you trust them."
            : `Nothing legible came back from the other ${imageCount - recognisedImages}. That is the ordinary answer for a picture with no writing in it.`,
        action: { label: "Check the reading", onClick: onCheckReading },
      });
    }
  }

  if (noiseSkipped > 0) {
    rows.push({
      key: "noise",
      kind: "note",
      icon: Filter,
      title: `${noiseSkipped} noise ${noiseSkipped === 1 ? "file was" : "files were"} skipped for you.`,
      body: "Lockfiles, dependency folders and build output. None of it reached the bundle.",
      panel: {
        label: noiseSkipped === 1 ? "Which file" : "Which files",
        content: <FileRows items={noiseFiles.map((name) => ({ name }))} />,
      },
    });
  }

  if (note) {
    rows.push({
      key: "note",
      kind: "note",
      icon: noteIcon ?? Info,
      title: note,
      action: noteAction,
    });
  }

  const groups: FileGroup[] = (
    [
      {
        key: "extracted",
        count: extractedFiles.length,
        label: "extracted",
        tone: "quiet",
        lead: "Text was pulled out of a document rather than read as file bytes. All of it is in the bundle.",
        items: extractedFiles.map((name) => ({ name })),
      },
      {
        key: "partly",
        count: partialDocuments.length,
        label: "partly read",
        tone: "warn",
        lead: "The text in the bundle is real, just not all of what the file holds. A model reading the bundle has no way to know that.",
        items: partialDocuments,
      },
      {
        key: "flagged",
        count: flaggedFiles.length,
        label: "flagged",
        tone: "warn",
        lead: "In the bundle, but they did not decode cleanly. If the preview below looks garbled, drop them.",
        items: flaggedFiles.map((name) => ({ name })),
      },
      {
        key: "left",
        count: unsupported.length,
        label: "left out",
        tone: "quiet",
        lead: "Not text, so nothing could be combined from them.",
        items: unsupported,
      },
      {
        key: "held",
        count: skippedByDefault.length,
        label: "held back",
        tone: "warn",
        lead: "Readable text, kept out by default: hidden dotfiles like .gitignore. Add any back if you need them.",
        items: skippedByDefault,
      },
    ] satisfies FileGroup[]
  ).filter((g) => g.count > 0);

  const groupTotal = groups.reduce((n, g) => n + g.count, 0);
  // A gap only when something is actually missing or incomplete. Extracted and
  // flagged files are in the bundle, so a group row carrying only those two is
  // a note: marking it as a gap would invent a loss that did not happen.
  const groupsAreGap = groups.some((g) => g.key !== "extracted" && g.key !== "flagged");

  const gapCount =
    rows.filter((r) => r.kind === "gap").length + (groups.length > 0 && groupsAreGap ? 1 : 0);
  const itemCount = rows.length + (groups.length > 0 ? 1 : 0);
  const noteCount = itemCount - gapCount;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[720px] text-pretty px-4 pt-12 motion-reduce:animate-none">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Check className="text-primary h-[17px] w-[17px] shrink-0" strokeWidth={2.8} />
        <h2 className="font-display text-ink text-xl font-semibold tracking-[-0.02em]">
          Your document is ready
        </h2>
        <span className="border-border bg-surface text-ink-muted rounded-chip max-w-full truncate border px-2.5 py-1 font-mono text-[11.5px] sm:ml-auto">
          {sourceLabel}
        </span>
      </div>

      {/* The export block. Copy, Download and both output settings in one card
          whose height does not move between a clean bundle and a messy one,
          because the position of the one action everybody came for must not
          depend on what their files happened to contain. Everything advisory
          lives below it, in the ledger. */}
      <div className="border-border bg-surface rounded-card border">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-6 gap-y-[18px] px-5 pb-4 pt-[17px]">
          <Figure value={fmt.format(tokens)} label={"tokens · estimated"} />
          <Figure
            value={fmt.format(filesCombined)}
            label={
              totalFiles > filesCombined
                ? `of ${fmt.format(totalFiles)} files combined`
                : filesCombined === 1
                  ? "file combined"
                  : "files combined"
            }
            dim
          />
          {fit && (
            <Figure
              value={over ? `${fit.ratio.toFixed(1)}x` : shareText(fit.ratio)}
              dim
              label={
                <>
                  of{" "}
                  {/* The share is stated against a model the reader may not have
                      picked, so the model's name is the way back to the picker. */}
                  <button
                    type="button"
                    onClick={onChangeModel}
                    title="Change model"
                    className="text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-surface whitespace-nowrap rounded-sm border-b border-dotted border-[oklch(var(--text-muted))] transition-colors duration-150 hover:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {fit.modelName}
                  </button>
                </>
              }
            />
          )}
          {/* What one send costs, input side only. Rendered only when the
              catalogue actually prices the model, because a missing price
              reads as zero and "$0.00" for a paid model is the worst kind of
              wrong. */}
          {weight.prefill && <Figure value={usd(weight.prefill.usd)} label="to send once" dim />}
        </div>


        {/* Married to the block that exports it: the format is decided at the
            button, never below it. */}
        <div className="flex flex-wrap items-center gap-x-[26px] gap-y-3.5 border-t border-[oklch(var(--hairline))] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-ink-muted text-[12.5px]">Format</span>
            <SegmentedControl
              ariaLabel="Output format"
              size="sm"
              tone="go"
              value={outputStyle}
              onChange={onOutputStyleChange}
              options={[
                { value: "xml", label: "XML" },
                { value: "markdown", label: "Markdown" },
                { value: "plain", label: "Plain" },
              ]}
            />
          </div>
          {bigBundle && (
            <div className="flex items-center gap-2.5">
              <span className="text-ink-muted text-[12.5px]">Output</span>
              <SegmentedControl
                ariaLabel="Split mode"
                size="sm"
                tone="go"
                value={splitMode}
                onChange={onSplitModeChange}
                options={[
                  { value: "single", label: "One file" },
                  { value: "multi", label: "Split into parts" },
                ]}
              />
            </div>
          )}
        </div>

        <div className="border-t border-[oklch(var(--hairline))] px-5 pb-[18px] pt-3.5">
          {isReading ? (
            // Held rather than hidden: the buttons keep their place and their
            // labels, in dashed outline, so the reason reads as a wait and not
            // as a missing feature. Text lands in the bundle only when the pass
            // ends, so an export taken mid-pass would quietly be missing every
            // scanned document.
            <>
              <div className="flex flex-wrap gap-2.5">
                <div
                  aria-disabled="true"
                  className="rounded-input bg-surface-alt text-ink-muted border-border-strong flex h-[46px] w-full cursor-not-allowed items-center justify-center gap-2.5 border border-dashed px-5 text-[15px] font-semibold sm:w-auto sm:flex-[1_1_240px]"
                >
                  <LoaderCircle
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    strokeWidth={2}
                  />
                  Copy
                </div>
                <div
                  aria-disabled="true"
                  className="rounded-input bg-surface-alt text-ink-muted border-border-strong flex h-[46px] w-full cursor-not-allowed items-center justify-center border border-dashed px-[18px] text-[14.5px] font-medium sm:w-auto sm:flex-[0_1_160px]"
                >
                  Download
                </div>
              </div>
              <div className="text-ink-secondary mt-3 flex flex-wrap items-baseline gap-2 text-[13px] leading-[1.55]">
                <span className="min-w-0 flex-[1_1_300px]">
                  Held while{" "}
                  {readProgress
                    ? `${readProgress.total} ${readProgress.total === 1 ? "file is" : "files are"}`
                    : "the drop is"}{" "}
                  being read. The text only lands in the bundle when the pass ends.
                </span>
                <button
                  type="button"
                  onClick={onStopReading}
                  disabled={isStopping}
                  className="border-border-strong rounded-chip text-ink hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-surface shrink-0 border px-3 py-1.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {isStopping ? "Stopping..." : "Stop reading and export what is here"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onCopy}
                className={cn(
                  "rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface flex h-[46px] w-full items-center justify-center gap-2.5 px-5 text-[15px] font-semibold transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:flex-[1_1_240px]",
                  isCopied
                    ? "text-go-fg border-primary border bg-[oklch(var(--primary)/0.16)]"
                    : "bg-primary text-primary-foreground hover:brightness-110",
                )}
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} /> Copied to clipboard
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={isGenerating}
                className="bg-secondary text-ink border-border-strong rounded-input hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-surface flex h-[46px] w-full items-center justify-center gap-2 border px-[18px] text-[14.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto sm:flex-[0_1_160px]"
              >
                <Download className="h-[15px] w-[15px]" />
                {isGenerating ? "Preparing..." : "Download"}
              </button>
            </div>
          )}

          {/* The card's footer: everything you might do to the bundle instead
              of exporting it. Under the buttons rather than over them, centred
              on the pair, and at the quietest weight on the card. */}
          <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2.5">
            <QuietAction
              icon={FilePlus}
              label="Add files"
              onClick={() => addInput.current?.click()}
            />
            <input
              ref={addInput}
              type="file"
              multiple
              className="hidden"
              onChange={onAddFiles}
              aria-label="Add files to this bundle"
            />
            <QuietAction
              icon={SlidersHorizontal}
              label="Adjust what's included"
              onClick={onAdjust}
            />
            {/* Asked in a modal, because it is the one control here that
                throws work away and there is no undo behind it. */}
            <QuietAction
              icon={RotateCcw}
              label="Start over"
              onClick={() => setConfirmReset(true)}
            />
          </div>
        </div>
      </div>

      {isReading && <ReadingProgress progress={readProgress} />}

      {/* Directly under the export block, because the Format control up
          there is what changes it. A setting whose effect is a screen away
          is a setting nobody can check before they paste. */}
      <div className="mt-[22px]">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h3 className="text-ink text-[13.5px]">What your AI receives</h3>
          <span className="text-ink-muted font-mono text-[11px] sm:ml-auto">
            {STYLE_LABEL[outputStyle]} ·{" "}
            {truncated
              ? `first ${fmt.format(PREVIEW_LIMIT)} of ${fmt.format(previewText.length)} characters`
              : `${fmt.format(previewText.length)} characters`}
          </span>
        </div>
        {/* A fixed window, not a max height: the page's geometry is the point of
            the rework, and a preview that sets its own height moves everything
            under it by however long the first file happens to be. */}
        <pre className="border-border bg-surface-inset text-code rounded-card h-[210px] overflow-auto border p-4 font-mono text-[11.5px] leading-[1.65]">
          {preview}
        </pre>
      </div>

      {itemCount > 0 ? (
        <div className="border-border rounded-card bg-surface-alt mt-4 overflow-hidden border">
          {/* Closed on arrival. The bundle is finished by the time this screen
              exists, so the account of how it was built is something you open
              when you want it. The header counts the gaps without being opened,
              which is what keeps a closed panel from hiding a loss. */}
          <button
            type="button"
            onClick={() => setLedgerOpen((o) => !o)}
            aria-expanded={ledgerOpen}
            aria-controls="ledger"
            className="hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-surface-alt flex w-full items-center gap-2.5 px-[18px] py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <ChevronDown
              className={cn(
                "text-ink-faint h-[15px] w-[15px] shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                ledgerOpen && "rotate-180",
              )}
              strokeWidth={2.1}
            />
            <span className="text-ink-secondary min-w-0 flex-1 text-[13.5px]">
              What happened to your files
            </span>
            <span className="text-ink-muted shrink-0 font-mono text-[11px]">
              {gapCount > 0 && (
                <span className="text-info">
                  {gapCount} {gapCount === 1 ? "gap" : "gaps"}
                  {noteCount > 0 && " · "}
                </span>
              )}
              {noteCount > 0 && `${noteCount} ${noteCount === 1 ? "note" : "notes"}`}
            </span>
          </button>
          {ledgerOpen && (
            <div id="ledger">
              {rows
                .filter((r) => r.kind === "gap")
                .map((r) => (
                  <Row key={r.key} row={r} />
                ))}
              {groups.length > 0 && (
                <FileGroups groups={groups} total={groupTotal} isGap={groupsAreGap} />
              )}
              {rows
                .filter((r) => r.kind === "note")
                .map((r) => (
                  <Row key={r.key} row={r} />
                ))}
            </div>
          )}
        </div>
      ) : (
        // The zeros, said once, in a sentence. A clean bundle earns a
        // confirmation rather than three cards reporting that nothing happened.
        //
        // Never while a pass runs. The scan and image rows step aside for the
        // reading card, which empties the ledger — and "nothing was skipped" is
        // a false claim about a bundle that is still waiting on four files.
        !isReading && (
          <div className="mt-4 flex items-start gap-[11px] px-0.5">
            <Mark kind="note" icon={Check} />
            <p className="text-ink-secondary text-[13.5px] leading-[1.55]">
              All {fmt.format(filesCombined)} {filesCombined === 1 ? "file" : "files"} came through
              whole. Nothing was skipped, nothing was partly read, no file dominates the bundle.
            </p>
          </div>
        )
      )}

      {/* No close cross: a confirmation with three ways out is a confirmation
          nobody reads. Escape and Keep it are the two, and Keep it is the first
          thing in the DOM so focus lands on the half that keeps the work. */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          displayClose={false}
          className="w-[calc(100%-2rem)] max-w-[440px] gap-0 p-0"
        >
          <DialogHeader className="px-5 pb-3 pt-5 sm:px-6">
            <DialogTitle className="text-ink font-display text-lg font-bold tracking-[-0.01em]">
              Start over?
            </DialogTitle>
            <DialogDescription className="text-ink-secondary text-[13.5px] leading-relaxed">
              This clears the bundle and every setting on this screen, and there is no way
              back to it. Your files are untouched where they are, so you can drop them
              again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2.5 px-5 pb-5 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-input text-ink-secondary hover:bg-accent hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background h-[38px] px-4 text-[13.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onStartOver}
              className="bg-secondary text-ink border-border-strong rounded-input hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background flex h-[38px] items-center justify-center gap-2 border px-4 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-[15px] w-[15px]" />
              Start over
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Under a hairline at the very bottom, at the smallest type on the
          screen: the task is finished by the time this is worth reading, and the
          people it is for are the ones already standing here with a bundle in
          front of them. */}
      <p className="text-ink-muted mt-[18px] border-t border-[oklch(var(--hairline))] pt-3.5 text-[12px] leading-[1.55]">
        Send a YouTube transcript, a Reddit or Hacker News thread, or any article straight into
        this bundle with{" "}
        <Link to="/clipper" className="text-go-fg whitespace-nowrap underline underline-offset-4">
          the Clipper
        </Link>
        .
      </p>
    </section>
  );
}

/** A headline figure has no room for a six-decimal tail, and a small bundle
 * really can cost a hundredth of a cent. Clipped the same way the share beside
 * it is: `<$0.01` next to `<1%`, one line at 32px either way. Spelling it out
 * as "under $0.01" wrapped, which grew the card and dropped the caption. */
function usd(amount: number) {
  return amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

/** A real bundle that rounds to zero is not zero, and "0%" reads as a broken
 * readout rather than a small one. */
function shareText(ratio: number) {
  const percent = Math.round(ratio * 100);
  return `${percent < 1 ? "<1" : percent}%`;
}

function Figure({ value, label, dim = false }: { value: string; label: ReactNode; dim?: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "font-display text-[32px] font-bold tabular-nums leading-none tracking-[-0.03em]",
          dim ? "text-ink-secondary" : "text-ink",
        )}
      >
        {value}
      </div>
      {/* A floor under the caption so a label that wraps to two lines does not
          shorten the block, and with it move Copy. */}
      <div className="text-ink-muted mt-2 min-h-[31px] font-mono text-[11px] leading-[1.4]">
        {label}
      </div>
    </div>
  );
}

/**
 * Two things at once. The icon says what the row is about — a scan, an image, a
 * filter, the size of the thing — and the container says which of the two tiers
 * it belongs to: a boxed and tinted mark for a gap, a bare one for a note.
 *
 * The tier has to survive a colour-vision difference and a greyscale
 * screenshot, which is why it is carried by the box rather than by the glyph or
 * the colour. Status on this screen decides whether someone re-reads a file
 * before trusting an answer.
 */
function Mark({ kind, icon: Icon }: { kind: "gap" | "note"; icon: LucideIcon }) {
  if (kind === "gap") {
    return (
      <div
        role="img"
        aria-label="Gap"
        className="text-info mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border border-[oklch(var(--info)/0.42)] bg-[oklch(var(--info)/0.13)]"
      >
        <Icon className="h-[13px] w-[13px]" strokeWidth={2.2} />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label="Note"
      className="text-ink-faint mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center"
    >
      <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} />
    </div>
  );
}

function Row({ row }: { row: LedgerRow }) {
  const [open, setOpen] = useState(false);
  const panelId = `ledger-${row.key}`;
  return (
    <div className="border-t border-[oklch(var(--hairline))] px-[18px] py-3.5">
      {/* The action drops under its own sentence on a narrow screen rather than
          squeezing the sentence into a four-word column beside it. Indented to
          the text, not to the mark, so the row still reads as one thing. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Mark kind={row.kind} icon={row.icon} />
          <div className="min-w-0">
            <div className="text-ink text-sm leading-[1.5]">{row.title}</div>
            {row.body && (
              <div className="text-ink-muted mt-[3px] text-[13px] leading-[1.55]">{row.body}</div>
            )}
          </div>
        </div>
        {row.action && (
          <button
            type="button"
            onClick={row.action.onClick}
            className="border-border-strong rounded-chip text-ink-secondary hover:bg-accent hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-alt ml-8 shrink-0 self-start border px-2.5 py-1.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:ml-0"
          >
            {row.action.label}
          </button>
        )}
        {row.panel && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="border-border-strong rounded-chip text-ink-secondary hover:bg-accent hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-alt ml-8 shrink-0 self-start border px-2.5 py-1.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:ml-0"
          >
            {open ? "Hide" : row.panel.label}
          </button>
        )}
      </div>
      {row.panel && open && (
        <div
          id={panelId}
          className="border-border bg-surface-inset mt-3 rounded-[11px] border p-3.5 sm:ml-8"
        >
          {row.panel.content}
        </div>
      )}
    </div>
  );
}

type FileGroup = {
  key: string;
  count: number;
  label: string;
  /** `warn` is for a group somebody may want to act on, `quiet` for one that
   * only reports. Never the row's own severity, which the mark carries. */
  tone: "quiet" | "warn";
  lead: string;
  items: { name: string; why?: string }[];
};

/**
 * The five caveat buckets as one row with five counts. They were five stacked
 * cards, which is five cards saying "here is a list of files" — the counts are
 * the part anyone reads, and the lists are evidence you open when a count
 * surprises you.
 */
function FileGroups({
  groups,
  total,
  isGap,
}: {
  groups: FileGroup[];
  total: number;
  isGap: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = groups.find((g) => g.key === open);

  return (
    <div className="border-t border-[oklch(var(--hairline))] px-[18px] py-3.5">
      <div className="flex items-start gap-3">
        <Mark kind={isGap ? "gap" : "note"} icon={FileX2} />
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="text-ink text-sm leading-[1.5]">
            {total} {total === 1 ? "file did" : "files did"} not come through as plain text.
          </div>
          <div className="text-ink-muted mt-[3px] text-[13px] leading-[1.55]">
            Open a group to see which files, and why.
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 sm:ml-8">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-expanded={open === g.key}
            aria-controls="file-group-list"
            onClick={() => setOpen((o) => (o === g.key ? null : g.key))}
            className={cn(
              "rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface-alt flex items-baseline gap-1.5 border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              g.tone === "warn"
                ? "text-info border-[oklch(var(--info)/0.34)]"
                : "text-ink-muted border-border hover:text-ink-secondary",
              open === g.key && "bg-accent",
            )}
          >
            <span className="font-semibold">{g.count}</span>
            {g.label}
          </button>
        ))}
      </div>
      {shown && (
        <div
          id="file-group-list"
          className="border-border bg-surface-inset animate-fade-up mt-3 rounded-[11px] border p-3.5 motion-reduce:animate-none sm:ml-8"
        >
          <p className="text-ink-muted mb-2.5 text-[12.5px] leading-[1.5]">{shown.lead}</p>
          <FileRows items={shown.items} />
        </div>
      )}
    </div>
  );
}

// Shows the first six entries, with a "Show all N" toggle that reveals the full
// list (scroll-capped) so a long list is never silently truncated.
const PREVIEW_ROWS = 6;

function FileRows({ items }: { items: { name: string; why?: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PREVIEW_ROWS);
  return (
    <>
      <ul
        className={cn(
          "flex flex-col gap-[7px]",
          expanded && items.length > 10 && "max-h-56 overflow-y-auto pr-1",
        )}
      >
        {shown.map((f) => (
          <li key={f.name} className="flex items-baseline gap-3.5 font-mono text-xs">
            <span className="text-code min-w-0 flex-1 truncate">{f.name}</span>
            {f.why && <span className="text-ink-muted shrink-0">{f.why}</span>}
          </li>
        ))}
      </ul>
      {items.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-ink-faint hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-surface-inset mt-2 rounded-sm font-mono text-[11px] underline decoration-[oklch(var(--hairline))] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

/**
 * A pass in flight, with a clock rather than a bar. Recognition has run from 31
 * seconds to 73 minutes on real drops, so a bar filling at an unknown rate is a
 * promise the pass cannot keep; elapsed time and a file count are both true at
 * every moment.
 */
function ReadingProgress({ progress }: { progress: { done: number; total: number } | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  const at = progress ? Math.min(progress.done + 1, total) : 0;

  return (
    <div className="border-border rounded-card bg-surface-alt mt-4 border px-[18px] py-3.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Mark kind="gap" icon={ScanText} />
          <div className="min-w-0">
            <div className="text-ink text-sm leading-[1.5]" aria-live="polite">
              {total > 0 ? `Reading ${at} of ${total} files.` : "Reading the pages as pictures."}
            </div>
            <div className="text-ink-muted mt-[3px] text-[13px] leading-[1.55]">
              Recognising the page images, here in the browser. You can leave this tab open and come
              back.
            </div>
          </div>
        </div>
        <span className="text-ink-muted ml-8 shrink-0 font-mono text-[11.5px] tabular-nums sm:ml-0 sm:mt-[3px]">
          {clock(elapsed)} elapsed
        </span>
      </div>
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function QuietAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FilePlus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-secondary hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm text-[13.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
