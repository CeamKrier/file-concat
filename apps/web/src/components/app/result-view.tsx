import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  EyeOff,
  FileQuestion,
  FileText,
  FileWarning,
  Info,
  LoaderCircle,
  RotateCcw,
  ScanText,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { InfoCard } from "./info-card";
import { SegmentedControl } from "./segmented-control";

type OutputStyle = "xml" | "markdown" | "plain";
type SplitMode = "single" | "multi";

export type UnsupportedFile = { name: string; why: string };

type ResultViewProps = {
  sourceLabel: string;
  note?: string | null;
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
  previewText: string;
  /** Genuinely not combinable as text — binaries, archives, unreadable files. */
  unsupported: UnsupportedFile[];
  /** Readable text held back by a default rule — hidden dotfiles, over the size cap. */
  skippedByDefault: UnsupportedFile[];
  /** Included files that decoded as "ambiguous" — kept in, but worth a look. */
  flaggedFiles: string[];
  /** Included files whose text was extracted from a document (PDF/Office/ODF). */
  extractedFiles: string[];
  /** Documents that opened but held no text — scans, which recognition can sometimes read. */
  unreadDocuments: string[];
  /** True while a recognition pass is running. */
  isReading: boolean;
  /** Recognition progress, or null when idle. */
  readProgress: { done: number; total: number } | null;
  /** Run recognition over the unread documents; resolves to how many became readable. */
  onReadUnread: () => Promise<number>;
  /** Open the "Adjust what's included" drawer. */
  onAdjust: () => void;
  bigBundle: boolean;
  splitMode: SplitMode;
  onSplitModeChange: (mode: SplitMode) => void;
};

const fmt = new Intl.NumberFormat("en-US");
const PREVIEW_LIMIT = 4000;

export function ResultView({
  sourceLabel,
  note,
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
  previewText,
  unsupported,
  skippedByDefault,
  flaggedFiles,
  extractedFiles,
  unreadDocuments,
  isReading,
  readProgress,
  onReadUnread,
  onAdjust,
  bigBundle,
  splitMode,
  onSplitModeChange,
}: ResultViewProps) {
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
          </span>
        )}
      </div>

      {/* One readout, three figures — not three metric cards. */}
      <div className="border-border bg-surface rounded-card mt-7 grid grid-cols-3 divide-x divide-[oklch(var(--hairline))] border">
        <Stat value={fmt.format(filesCombined)} label="files combined" />
        <Stat value={fmt.format(tokens)} label="tokens" />
        <Stat value={fmt.format(noiseSkipped)} label="noise files skipped" />
      </div>

      {/* Everything the bundle held back or flagged, condensed to one honest line
          so the format switch below can sit right on top of the preview it drives.
          Details expand in place — never between the switch and its result. */}
      <BundleNotes
        extractedFiles={extractedFiles}
        flaggedFiles={flaggedFiles}
        unsupported={unsupported}
        skippedByDefault={skippedByDefault}
      />

      {/* Scans are the one "left out" case with a remedy, so this stays out of
          the collapsed notes above: a file silently contributing nothing is the
          kind of thing the tool should say out loud, and the offer to fix it is
          worthless behind a disclosure nobody opens. */}
      <ScannedDocuments
        documents={unreadDocuments}
        isReading={isReading}
        progress={readProgress}
        onRead={onReadUnread}
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
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-[filter,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-5">
      <span className="font-display text-ink text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-ink-muted text-center text-xs">{label}</span>
    </div>
  );
}

/**
 * Documents that opened but held no text, and the one thing that can change
 * that. A scan is a picture of a page: there are no characters in the file to
 * read, only pixels that look like characters, and reading those is a separate
 * and much slower job.
 *
 * The cost is stated before the button, not after, because it is genuinely
 * felt — seconds per page and a one-time model download — and a person who
 * would rather not spend it should be able to decide without pressing anything.
 */
function ScannedDocuments({
  documents,
  isReading,
  progress,
  onRead,
}: {
  documents: string[];
  isReading: boolean;
  progress: { done: number; total: number } | null;
  onRead: () => Promise<number>;
}) {
  const [recovered, setRecovered] = useState(0);
  const [attempted, setAttempted] = useState(false);

  if (documents.length === 0 && recovered === 0) return null;

  const count = documents.length;
  const noun = count === 1 ? "document" : "documents";

  // Everything that could be read has been. Say so and stop offering.
  if (count === 0) {
    return (
      <div className="mt-3">
        <InfoCard
          tone="go"
          icon={Check}
          title={`Read ${recovered} scanned ${recovered === 1 ? "document" : "documents"}`}
        >
          <p>
            The text was recognised from the page images and added to the bundle. Worth a look at
            the preview below, since recognition guesses at characters and is rarely perfect.
          </p>
        </InfoCard>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <InfoCard
        tone="info"
        icon={ScanText}
        title={
          isReading
            ? // `done` counts finished documents, so the one in hand is the next
              // index — clamped, or the last document reads "3 of 2" for the
              // moment between its result landing and the pass ending.
              `Reading ${
                progress
                  ? `${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                  : count
              }…`
            : attempted
              ? `${count} ${noun} still couldn't be read`
              : `${count} ${noun} had no text to read`
        }
      >
        {isReading ? (
          <div className="flex items-center gap-2.5" aria-live="polite">
            <LoaderCircle
              className="text-info h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              strokeWidth={2}
            />
            <p>
              Recognising the page images. This runs here in the browser, so it takes a few seconds
              a page.
            </p>
          </div>
        ) : attempted ? (
          <p>
            Recognition found no writing in {count === 1 ? "it" : "them"} either. That usually means
            the {noun} {count === 1 ? "is" : "are"} encrypted, or the pages really are blank.
          </p>
        ) : (
          <>
            <p>
              {count === 1
                ? "It is a scan, a picture of a page with no text stored in the file."
                : "They are scans, pictures of pages with no text stored in the file."}{" "}
              Recognition can read the pixels instead: a few seconds a page, plus a one-time 5 MB
              language download.
            </p>
            <button
              type="button"
              onClick={async () => {
                setAttempted(true);
                const read = await onRead();
                setRecovered((r) => r + read);
              }}
              className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent mt-3 inline-flex items-center justify-center gap-2 border px-4 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <ScanText className="h-4 w-4" />
              Read {count === 1 ? "it" : "them"} anyway
            </button>
          </>
        )}
        <ExpandableList
          items={documents}
          renderItem={(name) => (
            <li key={name} className="text-ink font-mono text-[11px]">
              {name}
            </li>
          )}
        />
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
  flaggedFiles,
  unsupported,
  skippedByDefault,
}: {
  extractedFiles: string[];
  flaggedFiles: string[];
  unsupported: UnsupportedFile[];
  skippedByDefault: UnsupportedFile[];
}) {
  const [open, setOpen] = useState(false);

  const segments: string[] = [];
  if (extractedFiles.length) segments.push(`${extractedFiles.length} extracted`);
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
                default: hidden dotfiles like <span className="text-ink">.gitignore</span>, or files
                over the size cap. Add {skippedByDefault.length === 1 ? "it" : "any"} back if you
                need {skippedByDefault.length === 1 ? "it" : "them"}.
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
