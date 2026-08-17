import {
  Archive,
  FileQuestion,
  FilterX,
  ImageOff,
  LoaderCircle,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { EmptyKind } from "./empty-kind";

type ResultEmptyProps = {
  droppedFiles: string[];
  kind?: EmptyKind;
  onStartOver: () => void;
  /** Open the settings drawer. Only passed when something is there to re-include. */
  onAdjust?: () => void;
  /** True while a recognition pass is running. Only ever set for `scanned`. */
  isReading?: boolean;
  /** Recognition progress, or null when idle. */
  readProgress?: { done: number; total: number } | null;
  /** True when the last pass ended on a stop rather than on its own. */
  stoppedReading?: boolean;
  /** Run recognition over the unread documents; resolves to how many became readable. */
  onRead?: () => Promise<number>;
  /** Abandon the rest of a running pass. */
  onStopReading?: () => void;
  /**
   * Open the reading dialog. Only for `recognisable`: an image's pass is never
   * automatic, and the language and the subset are both worth choosing before
   * spending seconds an image (ADR-0017).
   */
  onOfferRead?: () => void;
};

// One rescue component, three voices, keyed by what was actually dropped. The
// tone is a heads-up (amber), never an error, and every variant offers a next
// step so the user is never at a dead end.
const COPY: Record<EmptyKind, { icon: LucideIcon; title: string; body: string; cta: string }> = {
  image: {
    icon: ImageOff,
    title: "These look like images, not text",
    body: "FileConcat bundles text (code, docs, configs and data) into one document. Images and binaries can't be combined this way, so nothing was left to pack.",
    cta: "Try a folder of files instead",
  },
  // Images, before anyone has looked. Not a dead end and not a promise either:
  // recognition reads writing off pixels, and whether these particular pixels
  // hold any is a thing only trying can settle (ADR-0017).
  recognisable: {
    icon: ScanText,
    title: "These are images",
    body: "Text can be read off them, here in the browser. FileConcat won't do it on its own, because an icon and a photographed page look alike until the work is done: a few seconds an image, plus a one-time 5 MB language download.",
    cta: "Read them",
  },
  archive: {
    icon: Archive,
    title: "That archive can't be opened here",
    body: "FileConcat unpacks .zip and .tar archives (including .tar.gz and .gz) right in the browser, but not .7z or .rar. Unzip it first, then drop the folder.",
    cta: "Start over",
  },
  // The one variant that is not a dead end at all: the documents opened fine,
  // there is simply nothing in them a reader can turn into characters, and
  // reading them is already under way by the time anyone sees this. The CTA is
  // the way back in after a stop.
  //
  // Two different causes land here and the copy has to hold both, because a
  // document whose fonts carry no character map is not a scan and saying it is
  // would be a plain untruth on the screen that explains the failure.
  scanned: {
    icon: ScanText,
    title: "These pages can't be read as text",
    body: "Either the page is a picture of text, or its fonts carry no map from what is stored back to letters. Either way there are no characters in the file to pull out. Recognition reads the pixels instead: a few seconds a page, plus a one-time 5 MB language download.",
    cta: "Read the rest",
  },
  // Not a rescue at all: the files are fine and the filters are the reason the
  // bundle is empty. Leads with the drawer, because starting over would drop
  // the same files into the same filters.
  filtered: {
    icon: FilterX,
    title: "The filters left nothing in",
    body: "These files are readable. Every one of them matched an ignore pattern, a .gitignore rule, or the hidden and oversize defaults, so there was nothing to pack.",
    cta: "Adjust what's included",
  },
  other: {
    icon: FileQuestion,
    title: "Nothing text-like to combine",
    body: "FileConcat bundles text (code, docs, configs and data) and pulls the text out of PDFs and Office files. These look binary or hold no extractable text, so nothing was left to pack.",
    cta: "Start over",
  },
};

const MAX_EXT_CHIPS = 16;

// Aggregate what was dropped down to a count per extension. That's the signal
// worth surfacing when nothing combined — "lots of .heic → maybe worth
// supporting" — and it reads at a glance without putting anyone's actual
// filenames on screen. Sorted by frequency, ties broken alphabetically.
function extensionHistogram(files: string[]): { ext: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of files) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : "no extension";
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext));
}

/**
 * The novice rescue. Reached when nothing combinable was found. Never a dead
 * end: explains what happened and offers the next step, tailored to the drop.
 */
export function ResultEmpty({
  droppedFiles,
  kind = "image",
  onStartOver,
  onAdjust,
  isReading = false,
  readProgress = null,
  stoppedReading = false,
  onRead,
  onStopReading,
  onOfferRead,
}: ResultEmptyProps) {
  const { icon: Icon, title, body, cta } = COPY[kind];
  // `filtered` leads with the drawer and keeps starting over as the quiet way
  // out. Every other variant keeps its own CTA in front and offers the drawer
  // underneath, but only when the drawer has a row to re-include: an Adjust
  // that opens an empty tree is a worse dead end than no Adjust at all.
  const adjust = onAdjust
    ? { label: "Adjust what's included", icon: SlidersHorizontal, onClick: onAdjust }
    : null;
  const startOver = { label: "Start over", icon: RotateCcw, onClick: onStartOver };
  const primary =
    kind === "filtered"
      ? (adjust ?? startOver)
      : kind === "recognisable" && onOfferRead
        ? { label: cta, icon: ScanText, onClick: onOfferRead }
        : { label: cta, icon: null, onClick: onStartOver };
  // Every variant but `filtered` puts Start over in front, so Adjust underneath
  // is enough. `recognisable` is the exception: its front button is the offer,
  // so without this there is no way out of the screen except taking it.
  const secondary =
    kind === "filtered"
      ? (adjust ? startOver : null)
      : kind === "recognisable"
        ? startOver
        : adjust;
  const extensions = extensionHistogram(droppedFiles);
  const shownExts = extensions.slice(0, MAX_EXT_CHIPS);
  const extraExts = extensions.length - shownExts.length;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[560px] px-4 pt-12 text-center motion-reduce:animate-none">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[oklch(var(--info)/0.4)] bg-[oklch(var(--info)/0.12)]">
        <Icon className="text-info h-6 w-6" strokeWidth={2} />
      </span>

      <h2 className="font-display text-ink mt-4 text-2xl font-bold tracking-[-0.02em]">{title}</h2>
      <p className="text-ink-secondary mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed">
        {body}
      </p>

      {shownExts.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {shownExts.map(({ ext, count }) => (
            <span
              key={ext}
              className="border-border bg-surface-alt text-ink-muted rounded-chip border px-2 py-1 font-mono text-[11px]"
            >
              {ext}
              {count > 1 && <span className="text-ink-faint"> ·{count}</span>}
            </span>
          ))}
          {extraExts > 0 && (
            <span className="text-ink-faint rounded-chip px-2 py-1 font-mono text-[11px]">
              +{extraExts} more {extraExts === 1 ? "type" : "types"}
            </span>
          )}
        </div>
      )}

      {kind === "scanned" && onRead ? (
        <ReadAction
          label={cta}
          isReading={isReading}
          progress={readProgress}
          stopped={stoppedReading}
          onRead={onRead}
          onStop={onStopReading}
          onStartOver={onStartOver}
          onAdjust={onAdjust}
        />
      ) : kind === "recognisable" && isReading ? (
        // A pass someone started from the dialog, seen from the screen behind
        // it. The dialog carries its own stop; this one is for the case where it
        // was closed mid-pass.
        <ReadingProgress progress={readProgress} onStop={onStopReading} />
      ) : (
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={primary.onClick}
            className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {primary.icon && <primary.icon className="h-4 w-4" strokeWidth={2} />}
            {primary.label}
          </button>
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <secondary.icon className="h-4 w-4" />
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A pass in flight, and the way out of it. Shared by both variants that can
 * have one running behind them. */
function ReadingProgress({
  progress,
  onStop,
}: {
  progress: { done: number; total: number } | null;
  onStop?: () => void;
}) {
  return (
    <div className="mt-7 flex flex-col items-center gap-3">
      <div className="text-ink-secondary flex items-center gap-2.5 text-sm" aria-live="polite">
        <LoaderCircle
          className="text-info h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
          strokeWidth={2}
        />
        {/* `done` counts finished files, so the one in hand is the next index.
            Clamped, or the last one reads "3 of 2" for the moment between its
            result landing and the pass ending. */}
        <span>
          Reading
          {progress ? ` ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : ""}…
        </span>
      </div>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Stop reading
        </button>
      )}
    </div>
  );
}

/**
 * The scanned variant's action. Three states, in the order a person meets them:
 * running (which is where everyone starts, since the pass begins with the
 * drop), stopped, and the honest dead end when recognition found nothing
 * either. A success never renders here — the moment a document becomes readable
 * the flow has a bundle, and the result screen replaces this one.
 */
function ReadAction({
  label,
  isReading,
  progress,
  stopped,
  onRead,
  onStop,
  onStartOver,
  onAdjust,
}: {
  label: string;
  isReading: boolean;
  progress: { done: number; total: number } | null;
  stopped: boolean;
  onRead: () => Promise<number>;
  onStop?: () => void;
  onStartOver: () => void;
  onAdjust?: () => void;
}) {
  // The scans are not the only thing in the drop: when readable files were
  // filtered out too, the drawer is still a way forward once recognition is
  // over. Rendered only where the pass has stopped, so it never competes with
  // the running one.
  const adjustLink = onAdjust ? (
    <button
      type="button"
      onClick={onAdjust}
      className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <SlidersHorizontal className="h-4 w-4" />
      Adjust what&apos;s included
    </button>
  ) : null;
  if (isReading) return <ReadingProgress progress={progress} onStop={onStop} />;

  // Stopped with nothing recovered, so the screen never changed. Offer the way
  // back in; the pages already read (if any) took the flow to the result view.
  if (stopped) {
    return (
      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void onRead()}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <ScanText className="h-4 w-4" strokeWidth={2} />
          {label}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Start over
        </button>
        {adjustLink}
      </div>
    );
  }

  return (
    <>
      <p className="text-ink-secondary mx-auto mt-6 max-w-[440px] text-[14px] leading-relaxed">
        Recognition found no writing in them either. That usually means the documents are encrypted,
        or the pages really are blank.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStartOver}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center px-5 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Start over
        </button>
        {adjustLink}
      </div>
    </>
  );
}
