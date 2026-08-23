import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  EyeOff,
  FileMinus,
  FilePlus,
  FileQuestion,
  FileText,
  FileWarning,
  Info,
  LoaderCircle,
  RotateCcw,
  ScanText,
  Scissors,
  SlidersHorizontal,
  Weight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { BundleWeight } from "~/lib/bundle-weight";
import { InfoCard } from "./info-card";
import { SegmentedControl } from "./segmented-control";

type OutputStyle = "xml" | "markdown" | "plain";
type SplitMode = "single" | "multi";

export type UnsupportedFile = { name: string; why: string };

type ResultViewProps = {
  sourceLabel: string;
  note?: string | null;
  /** The one thing the note can offer to do, shown as a link beside it. */
  noteAction?: { label: string; onClick: () => void };
  filesCombined: number;
  tokens: number;
  noiseSkipped: number;
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
  /** How many documents recognition has already rescued in this Run. */
  recoveredDocuments: number;
  /** True when the last recognition pass ended on a stop rather than on its own. */
  stoppedReading: boolean;
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

export function ResultView({
  sourceLabel,
  note,
  noteAction,
  filesCombined,
  tokens,
  noiseSkipped,
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
  recoveredDocuments,
  stoppedReading,
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
  const truncated = previewText.length > PREVIEW_LIMIT;
  const preview = truncated ? previewText.slice(0, PREVIEW_LIMIT) + "\n…" : previewText;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[720px] px-4 pt-12 motion-reduce:animate-none">
      <div className="flex flex-col items-center text-center">
        <span className="border-primary flex h-12 w-12 items-center justify-center rounded-full border-2 bg-[oklch(var(--primary)/0.12)]">
          <Check className="text-primary h-6 w-6" strokeWidth={2.5} />
        </span>
        <h2 className="font-display text-ink mt-4 text-[30px] font-bold tracking-[-0.02em]">
          Your file&apos;s ready
        </h2>
        <p className="text-ink-muted mt-2 font-mono text-[13px]">
          <span className="text-ink-secondary">{sourceLabel}</span> → one document
        </p>
        {note && (
          <span className="text-go-fg rounded-pill mt-3 inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 text-[12px]">
            <Check className="text-primary h-3 w-3 shrink-0" strokeWidth={2.5} />
            {note}
            {noteAction && (
              <button
                type="button"
                onClick={noteAction.onClick}
                className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm font-medium underline underline-offset-2 transition-opacity duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {noteAction.label}
              </button>
            )}
          </span>
        )}
      </div>

      {/* One readout, three figures — not three metric cards. The token figure
          carries its own context-fit line, because a share of a window belongs
          against the number it is a share of, not in a card further down. */}
      <div className="border-border bg-surface rounded-card mt-7 grid grid-cols-3 divide-x divide-[oklch(var(--hairline))] border">
        <Stat value={fmt.format(filesCombined)} label="files combined" />
        <Stat value={fmt.format(tokens)} label="tokens" hint={fitHint(weight, onChangeModel)} />
        <Stat value={fmt.format(noiseSkipped)} label="noise files skipped" />
      </div>

      <BundleWeightNote weight={weight} />

      {/* Everything the bundle held back or flagged, condensed to one honest line
          so the format switch below can sit right on top of the preview it drives.
          Details expand in place — never between the switch and its result. */}
      <BundleNotes
        extractedFiles={extractedFiles}
        partialDocuments={partialDocuments}
        flaggedFiles={flaggedFiles}
        unsupported={unsupported}
        skippedByDefault={skippedByDefault}
      />

      {/* Scans are the one "left out" case with a remedy, so this stays out of
          the collapsed notes above: a file silently contributing nothing is the
          kind of thing the tool should say out loud, and the offer to fix it is
          worthless behind a disclosure nobody opens. */}
      <ScannedDocuments
        total={scannedDocumentCount}
        recovered={recoveredDocuments}
        isReading={isReading}
        progress={readProgress}
        stopped={stoppedReading}
        languageNote={readLanguageNote}
        onCheck={onCheckReading}
      />

      {/* Its own card, never a row inside the one above. An image was never
          promised as text, so it is not a gap in the bundle the way a scan is —
          it is an offer, and the two must not be read as one number. */}
      <RecognisableImages
        total={imageCount}
        read={recognisedImages}
        isReading={isReading}
        progress={readProgress}
        onCheck={onCheckReading}
      />

      {bigBundle && (
        <div className="mt-3">
          <InfoCard
            tone="neutral"
            icon={Scissors}
            title="Big bundle: splitting is optional, just easier to paste"
          >
            <p>One paste can be a lot for a chat box. Split it into parts, or keep it as one.</p>
            <div className="mt-2.5">
              <SegmentedControl
                ariaLabel="Split mode"
                size="sm"
                value={splitMode}
                onChange={onSplitModeChange}
                options={[
                  { value: "single", label: "Keep as one file" },
                  { value: "multi", label: "Split into parts" },
                ]}
              />
            </div>
          </InfoCard>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {/* Held while recognition runs. Text lands in the bundle only when the
            pass ends, so an export taken mid-pass would quietly be missing every
            scanned document — the card above says so, and offers the stop that
            releases these immediately. */}
        <button
          type="button"
          onClick={onCopy}
          disabled={isReading}
          className={cn(
            "rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60",
            isCopied
              ? "text-go-fg border-primary border bg-[oklch(var(--primary)/0.16)]"
              : "bg-primary text-primary-foreground hover:brightness-110",
          )}
        >
          {isReading ? (
            <>
              <LoaderCircle
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                strokeWidth={2}
              />{" "}
              Still reading
            </>
          ) : isCopied ? (
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
          disabled={isGenerating || isReading}
          className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex items-center justify-center gap-2 border px-5 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isGenerating ? "Preparing…" : "Download"}
        </button>
      </div>

      {/* Result-scoped actions live with the result, not the global header:
          refine the bundle or start fresh, one step from Copy/Download and the
          same on every viewport. Quiet by design — Copy stays the loud one. */}
      <div className="mt-3 flex flex-col items-center justify-center gap-x-8 gap-y-1 sm:flex-row">
        {/* Grow it, refine it, discard it — in that order, because that is the
            order they get reached for. Add files keeps the bundle and extends
            it; only Start over throws anything away. */}
        <button
          type="button"
          onClick={() => addInput.current?.click()}
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <FilePlus className="h-4 w-4" />
          Add files
        </button>
        <input
          ref={addInput}
          type="file"
          multiple
          className="hidden"
          onChange={onAddFiles}
          aria-label="Add files to this bundle"
        />
        <button
          type="button"
          onClick={onAdjust}
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Adjust what&apos;s included
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" />
          Start over
        </button>
      </div>

      {/* Format switch married to the preview it drives: press here, see it there,
          nothing in between. */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.12em]">
          Format
        </span>
        <SegmentedControl
          ariaLabel="Output format"
          value={outputStyle}
          onChange={onOutputStyleChange}
          options={[
            { value: "xml", label: "XML" },
            { value: "markdown", label: "Markdown" },
            { value: "plain", label: "Plain" },
          ]}
        />
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-ink-secondary text-sm font-medium">What your AI receives</h3>
          {truncated && (
            <span className="text-ink-faint font-mono text-[11px]">
              preview · first {fmt.format(PREVIEW_LIMIT)} chars
            </span>
          )}
        </div>
        <pre className="border-border bg-surface-inset text-code rounded-card max-h-[420px] overflow-auto border p-4 font-mono text-xs leading-relaxed">
          {preview}
        </pre>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: { text: string; tone: "quiet" | "warn" | "over"; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-5">
      <span className="font-display text-ink text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-ink-muted text-center text-xs">{label}</span>
      {/* The share is stated against a model the reader may not have picked, so
          the sentence itself is the way back to the picker. A dotted underline
          at 11px is the whole affordance; the tone colour still carries the
          warning. */}
      {hint && (
        <button
          type="button"
          onClick={hint.onClick}
          title="Change model"
          className={cn(
            "rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface text-center text-[11px] tabular-nums underline decoration-dotted underline-offset-[3px] transition-colors duration-150 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            // ink-faint reads at 3.17:1 here — fine for a whisper, not for
            // something you are meant to click. ink-muted is the floor.
            hint.tone === "quiet" && "text-ink-muted hover:text-ink-secondary",
            hint.tone === "warn" && "text-info",
            hint.tone === "over" && "text-stop-fg",
          )}
        >
          {hint.text}
        </button>
      )}
    </div>
  );
}

/**
 * The token figure's share of the chosen model's context window. Always shown
 * once a model is known, quiet while there is room: a warning that only ever
 * appears when something is wrong teaches nobody what the healthy state looks
 * like, and this one costs a single muted line.
 *
 * Over 100% it switches from a percentage to a multiple, because "160%" reads
 * as a near-miss and "1.6x" reads as what it is.
 */
function fitHint(
  weight: BundleWeight,
  onClick: () => void,
): { text: string; tone: "quiet" | "warn" | "over"; onClick: () => void } | null {
  if (!weight.fit) return null;
  const { level, ratio, modelName } = weight.fit;
  if (level === "over") {
    return { text: `${ratio.toFixed(1)}× ${modelName}`, tone: "over", onClick };
  }
  // A real bundle that rounds to zero is not zero, and "0%" reads as a broken
  // readout rather than a small one.
  const percent = Math.round(ratio * 100);
  return {
    text: `${percent < 1 ? "<1" : percent}% of ${modelName}`,
    tone: level === "tight" ? "warn" : "quiet",
    onClick,
  };
}

/**
 * What the removed per-file size cap used to decide on everyone's behalf.
 *
 * One card, never three. Model fit, browser cost and a dominant file are three
 * sentences about one object, and stacking a card per axis would turn a heavy
 * bundle into a wall of warnings — the exact overreaction the cap was. Tone
 * follows the worst condition; nothing here blocks anything.
 *
 * It carries no action of its own either. The remedy is "leave some files out",
 * and the quiet action row under Copy/Download already offers exactly that in
 * the same viewport — a second Adjust link inside the card was the same door
 * twice, 130px apart.
 */
function BundleWeightNote({ weight }: { weight: BundleWeight }) {
  if (!weight.hasWarning) return null;

  const over = weight.fit?.level === "over";
  const tight = weight.fit?.level === "tight";
  const title = over
    ? `Bigger than ${weight.fit?.modelName}'s context window`
    : tight
      ? `Fills most of ${weight.fit?.modelName}'s context window`
      : "A big bundle for one paste";

  return (
    <div className="mt-3">
      <InfoCard tone={over ? "stop" : "info"} icon={Weight} title={title}>
        {over && weight.fit && (
          <p>
            About {weight.fit.ratio.toFixed(1)}&times; the {fmt.format(weight.fit.contextLimit)}{" "}
            tokens it can hold at once. Hand it over as a file rather than a paste, pick a model
            with a bigger window, or leave some files out.
          </p>
        )}
        {tight && weight.fit && (
          <p>
            That leaves roughly{" "}
            {fmt.format(Math.max(0, Math.round(weight.fit.contextLimit * (1 - weight.fit.ratio))))}{" "}
            tokens for your own prompt and the reply. The count is an estimate, so read this as
            close rather than certain.
          </p>
        )}
        {weight.isLarge && (
          <p className={cn((over || tight) && "mt-1.5")}>
            Past 1 MB the token figure is forecast from character count instead of measured, and
            Copy can take a moment.
          </p>
        )}
        {weight.dominant && (
          <p className="mt-1.5">
            {/* Floored, not rounded: a 99.9% share alongside two other files
                must not print as "100% of it". */}
            <span className="font-mono text-[12px]">{weight.dominant.path}</span> alone is{" "}
            {Math.floor(weight.dominant.share * 100)}% of it.
          </p>
        )}
      </InfoCard>
    </div>
  );
}

/**
 * Documents the ordinary reader could not read, whatever stopped it. A scan is a
 * picture of a page: there are no characters in the file, only pixels that look
 * like characters. A page whose fonts carry no character map has the opposite
 * problem — characters that decode to nothing anyone can read. Both end here,
 * because the answer to both is to look at the page as a picture, which is a
 * separate and much slower job.
 *
 * So the copy says "document" and not "scanned document": the word was true of
 * everything this card described until page recognition arrived, and calling a
 * government PDF with broken fonts a scan would be a plain untruth on the one
 * card whose job is to say what happened.
 *
 * This card states the outcome and opens the door. It carries no action of its
 * own: every recognition control after the drop lives in the reading dialog,
 * because the one thing you need before changing a language is the text that
 * language produced, and the text is in there. A picker out here would be an
 * invitation to spend four seconds a page on a hunch.
 */
function ScannedDocuments({
  total,
  recovered,
  isReading,
  progress,
  stopped,
  languageNote,
  onCheck,
}: {
  total: number;
  recovered: number;
  isReading: boolean;
  progress: { done: number; total: number } | null;
  stopped: boolean;
  languageNote: string | null;
  onCheck: () => void;
}) {
  if (total === 0) return null;

  const left = total - recovered;
  const noun = (n: number) => (n === 1 ? "document" : "documents");
  const asLanguage = languageNote ? ` ${languageNote}` : "";

  // A pass in flight outranks every reading of the counts. It is reachable out
  // here only by closing the dialog mid-pass, which is allowed: the alternative
  // is locking someone in a box for seconds a page. So this states the progress
  // and sends them back to where the stop button is, rather than growing one.
  if (isReading) {
    const running = progress?.total ?? total;
    return (
      <ReadingCard
        tone="info"
        icon={ScanText}
        title={`Reading ${progress ? `${Math.min(progress.done + 1, running)} of ${running}` : running}…`}
        cta="Check the reading"
        onCheck={onCheck}
        busy
      >
        Recognising the page images, here in the browser. Copy and Download wait for it, because the
        text lands in the bundle only when the pass ends.
      </ReadingCard>
    );
  }

  if (recovered === total) {
    return (
      <ReadingCard
        tone="go"
        icon={Check}
        title={`Read ${recovered} ${noun(recovered)}${asLanguage}`}
        cta="Check the reading"
        onCheck={onCheck}
      >
        Recognition guesses at characters, and a reading in the wrong language comes back looking
        like a success. Worth a look before you trust it.
      </ReadingCard>
    );
  }

  if (recovered > 0) {
    return (
      <ReadingCard
        tone="info"
        icon={ScanText}
        title={`Read ${recovered} of ${total} documents${asLanguage}`}
        cta="Check the reading"
        onCheck={onCheck}
      >
        {stopped
          ? `The page in hand finished, and everything read before you stopped is in the bundle. The other ${left} ${noun(left)} ${left === 1 ? "is" : "are"} still out.`
          : `Nothing legible came back from the other ${left}. Another language is the thing worth ruling out.`}
      </ReadingCard>
    );
  }

  return (
    <ReadingCard
      tone="info"
      icon={ScanText}
      title={
        stopped
          ? `Stopped, with ${total} ${noun(total)} unread`
          : `${total} ${noun(total)} couldn't be read`
      }
      cta={stopped ? "Read them" : "Try another language"}
      onCheck={onCheck}
    >
      {stopped
        ? `Recognition never got to ${total === 1 ? "it" : "them"}, so ${total === 1 ? "it holds" : "they hold"} nothing yet.`
        : `Recognition found no writing in ${total === 1 ? "it" : "them"} either. That usually means the ${noun(total)} ${total === 1 ? "is" : "are"} encrypted, the pages really are blank, or the language was wrong.`}
    </ReadingCard>
  );
}

/**
 * The other population recognition can read: images (ADR-0017). A separate card
 * from the one above and deliberately so — a scan is a document that failed to
 * deliver what its format promised, while an image promised nothing, so folding
 * the two into one count would invent a gap that is not there.
 *
 * Which is also why the untried state is an offer and not a warning: nobody
 * knows whether these hold writing, and the copy must not imply they do. The
 * word "document" never appears here.
 */
function RecognisableImages({
  total,
  read,
  isReading,
  progress,
  onCheck,
}: {
  total: number;
  read: number;
  isReading: boolean;
  progress: { done: number; total: number } | null;
  onCheck: () => void;
}) {
  if (total === 0) return null;

  const noun = (n: number) => (n === 1 ? "image" : "images");

  if (isReading) {
    const running = progress?.total ?? total;
    return (
      <ReadingCard
        tone="info"
        icon={ScanText}
        title={`Reading ${progress ? `${Math.min(progress.done + 1, running)} of ${running}` : running}…`}
        cta="Check the reading"
        onCheck={onCheck}
        busy
      >
        Recognising the pictures, here in the browser. Copy and Download wait for it, because the
        text lands in the bundle only when the pass ends.
      </ReadingCard>
    );
  }

  if (read > 0) {
    return (
      <ReadingCard
        tone="go"
        icon={Check}
        title={
          read < total
            ? `Read ${read} of ${total} ${noun(total)}`
            : total === 1
              ? "Read the image"
              : `Read all ${total} images`
        }
        cta="Check the reading"
        onCheck={onCheck}
      >
        {read === total
          ? "Recognition guesses at characters, so the words in the bundle are close rather than exact. Worth a look before you trust them."
          : `Nothing legible came back from the other ${total - read}. That is the ordinary answer for a picture with no writing in it.`}
      </ReadingCard>
    );
  }

  return (
    <ReadingCard
      tone="info"
      icon={ScanText}
      title={`${total} ${noun(total)} might be holding text`}
      cta="Read them"
      onCheck={onCheck}
    >
      Recognition can read writing off a picture, here in the browser. It is never started for you:
      a few seconds an image, and only you know whether these are pages or decoration.
    </ReadingCard>
  );
}

/** One shape for all four states: a sentence, and the one door out of it. */
function ReadingCard({
  tone,
  icon,
  title,
  cta,
  onCheck,
  busy = false,
  children,
}: {
  tone: "info" | "go";
  icon: LucideIcon;
  title: string;
  cta: string;
  onCheck: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <InfoCard tone={tone} icon={icon} title={title}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <p className="min-w-0 flex-1" aria-live={busy ? "polite" : undefined}>
            {children}
          </p>
          <button
            type="button"
            onClick={onCheck}
            className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex shrink-0 items-center justify-center gap-2 border px-4 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {busy ? (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                strokeWidth={2}
              />
            ) : (
              <ScanText className="h-4 w-4" />
            )}
            {cta}
          </button>
        </div>
      </InfoCard>
    </div>
  );
}

// The bundle's caveats — extracted, flagged, left-out, held-back files — kept to
// a single honest summary line by default, with the full cards one click away.
// Collapsed is the norm so the format switch stays glued to the preview; the
// detail (and the "preview looks garbled" flag) still lives above the preview.
function BundleNotes({
  extractedFiles,
  partialDocuments,
  flaggedFiles,
  unsupported,
  skippedByDefault,
}: {
  extractedFiles: string[];
  partialDocuments: UnsupportedFile[];
  flaggedFiles: string[];
  unsupported: UnsupportedFile[];
  skippedByDefault: UnsupportedFile[];
}) {
  const [open, setOpen] = useState(false);

  const segments: string[] = [];
  if (extractedFiles.length) segments.push(`${extractedFiles.length} extracted`);
  if (partialDocuments.length) segments.push(`${partialDocuments.length} partly read`);
  if (flaggedFiles.length) segments.push(`${flaggedFiles.length} flagged`);
  if (unsupported.length) segments.push(`${unsupported.length} left out`);
  if (skippedByDefault.length) segments.push(`${skippedByDefault.length} held back`);

  if (segments.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="bundle-notes"
        className="border-border bg-surface hover:border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center gap-3 border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Info className="text-ink-faint h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="text-ink-secondary min-w-0 flex-1 truncate text-[13px]">
          {segments.join(" · ")}
        </span>
        <span className="text-ink-faint inline-flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]">
          {open ? "Hide" : "Details"}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            strokeWidth={2}
          />
        </span>
      </button>

      {open && (
        <div
          id="bundle-notes"
          className="animate-fade-up mt-3 flex flex-col gap-3 motion-reduce:animate-none"
        >
          {extractedFiles.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileText}
              title={`Text extracted from ${extractedFiles.length} ${extractedFiles.length === 1 ? "document" : "documents"}`}
            >
              <p>
                {extractedFiles.length === 1 ? "It was" : "They were"} included as extracted text —
                the readable content pulled out of the document, not the original file bytes.
              </p>
              <ExpandableList
                items={extractedFiles}
                renderItem={(name) => (
                  <li key={name} className="text-ink font-mono text-[11px]">
                    {name}
                  </li>
                )}
              />
            </InfoCard>
          )}
          {partialDocuments.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileMinus}
              title={`${partialDocuments.length} ${partialDocuments.length === 1 ? "document" : "documents"} came through incomplete`}
            >
              <p>
                The text below {partialDocuments.length === 1 ? "it" : "them"} is real, just not all
                of what the file holds. A model reading the bundle has no way to know that, so it is
                worth checking the original before trusting an answer about{" "}
                {partialDocuments.length === 1 ? "it" : "them"}.
              </p>
              <ExpandableList
                items={partialDocuments}
                renderItem={(f) => (
                  <li key={f.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-ink">{f.name}</span>
                    <span className="text-ink-faint">· {f.why}</span>
                  </li>
                )}
              />
            </InfoCard>
          )}
          {flaggedFiles.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileQuestion}
              title={`${flaggedFiles.length} ${flaggedFiles.length === 1 ? "file" : "files"} might not be plain text`}
            >
              <p>
                {flaggedFiles.length === 1 ? "It was" : "They were"} kept in, but we couldn&apos;t
                read {flaggedFiles.length === 1 ? "it" : "them"} cleanly. If the preview below looks
                garbled, drop {flaggedFiles.length === 1 ? "it" : "them"} from the bundle.
              </p>
              <ExpandableList
                items={flaggedFiles}
                renderItem={(name) => (
                  <li key={name} className="text-ink font-mono text-[11px]">
                    {name}
                  </li>
                )}
              />
            </InfoCard>
          )}
          {unsupported.length > 0 && (
            <InfoCard
              tone="info"
              icon={FileWarning}
              title={`${unsupported.length} ${unsupported.length === 1 ? "file isn't" : "files aren't"} text, left out`}
            >
              <p>
                These can&apos;t be combined as text, so they were skipped. Everything else made it
                in.
              </p>
              <ExpandableList
                items={unsupported}
                renderItem={(f) => (
                  <li key={f.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-ink">{f.name}</span>
                    <span className="text-ink-faint">· {f.why}</span>
                  </li>
                )}
              />
            </InfoCard>
          )}
          {skippedByDefault.length > 0 && (
            <InfoCard
              tone="neutral"
              icon={EyeOff}
              title={`${skippedByDefault.length} text ${skippedByDefault.length === 1 ? "file" : "files"} left out by default`}
            >
              <p>
                {skippedByDefault.length === 1 ? "It's" : "They're"} readable text, just kept out by
                default: hidden dotfiles like <span className="text-ink">.gitignore</span>. Add{" "}
                {skippedByDefault.length === 1 ? "it" : "any"} back if you need{" "}
                {skippedByDefault.length === 1 ? "it" : "them"}.
              </p>
              <ExpandableList
                items={skippedByDefault}
                renderItem={(f) => (
                  <li key={f.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-ink">{f.name}</span>
                    <span className="text-ink-faint">· {f.why}</span>
                  </li>
                )}
              />
            </InfoCard>
          )}
        </div>
      )}
    </div>
  );
}

// Shows the first six entries, with a "Show all N" toggle that reveals the full
// flat list (scroll-capped) so a long left-out list is never silently truncated.
const PREVIEW_ROWS = 6;

function ExpandableList<T>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PREVIEW_ROWS);
  return (
    <>
      <ul
        className={cn(
          "mt-2 flex flex-col gap-1",
          expanded && items.length > 10 && "max-h-56 overflow-y-auto pr-1",
        )}
      >
        {shown.map(renderItem)}
      </ul>
      {items.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-ink-faint hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-background mt-1.5 rounded-sm font-mono text-[11px] underline decoration-[oklch(var(--hairline))] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}
