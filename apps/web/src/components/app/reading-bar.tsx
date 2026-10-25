import { useEffect, useRef, useState } from "react";
import { AudioLines, Image as ImageIcon, LoaderCircle, ScanText, Square, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { GETTING_READER, type LastPass, type ReadProgress } from "~/hooks/use-file-ingestion";

/** One kind of file a pass can still be offered over, and the button that starts it. */
export type ReadingOffer = {
  key: "images" | "speech" | "scans";
  icon: LucideIcon;
  text: string;
  label: string;
  onRead: () => void;
};

export type ReadingBarProps = {
  isReading: boolean;
  progress: ReadProgress;
  isStopping: boolean;
  onStop: () => void;
  /** What can still be read, one line per kind. Only shown between passes. */
  offers?: ReadingOffer[];
  /** How the last pass ended, when that needs saying (see {@link passOutcome}). */
  outcome?: string | null;
  /** The language the next pass reads in, and the way to pick another. */
  language?: { name: string; fallback: boolean; onChange: () => void };
  className?: string;
};

/**
 * A press on Stop this soon after it appears is a second press meant for the
 * button that was there before it, Read, and is ignored.
 */
const STOP_GUARD_MS = 600;

/**
 * Everything recognition does after a drop, in one place (Q5): the offer, the
 * reader's download, the count, the stop, and how the last pass ended. Images,
 * scans and speech used to report this in four different components, three of
 * which had their own Stop.
 *
 * A clock rather than a bar while a pass runs. Recognition has run from 31
 * seconds to 73 minutes on real drops, so a bar filling at an unknown rate is a
 * promise the pass cannot keep; elapsed time and a file count are both true at
 * every moment.
 */
export function ReadingBar({
  isReading,
  progress,
  isStopping,
  onStop,
  offers = [],
  outcome,
  language,
  className,
}: ReadingBarProps) {
  if (isReading) {
    return (
      <Running
        progress={progress}
        isStopping={isStopping}
        onStop={onStop}
        language={language?.name}
        className={className}
      />
    );
  }
  if (offers.length === 0 && !outcome) return null;
  return (
    <div className={cn("border-border rounded-card bg-surface-alt border", className)}>
      {outcome && (
        <p className="text-ink-secondary border-b border-[oklch(var(--hairline))] px-[18px] py-3 text-[13.5px] leading-[1.55] last:border-b-0">
          {outcome}
        </p>
      )}
      {offers.map((offer) => (
        <div
          key={offer.key}
          className="flex flex-col gap-2.5 border-b border-[oklch(var(--hairline))] px-[18px] py-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <GapMark icon={offer.icon} />
            <span className="text-ink text-sm leading-[1.5]">{offer.text}</span>
          </div>
          <button
            type="button"
            onClick={offer.onRead}
            // Secondary, so Copy stays the one primary action on the screen.
            className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt ml-[34px] inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 self-start border px-4 text-[13.5px] font-medium transition-colors duration-150 hover:bg-[oklch(var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:ml-0 sm:self-auto"
          >
            {offer.label}
          </button>
        </div>
      ))}
      {language && offers.length > 0 && (
        <div className="text-ink-muted flex flex-wrap items-center gap-x-2 px-[18px] py-1.5 text-[12.5px]">
          <span>
            Reads in {language.name}
            {language.fallback ? ", since your browser's language has no reader here." : "."}
          </span>
          <button
            type="button"
            onClick={language.onChange}
            className="text-ink-secondary hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-alt min-h-[44px] rounded-sm px-1 underline decoration-[oklch(var(--hairline))] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            Change language
          </button>
        </div>
      )}
    </div>
  );
}

function Running({
  progress,
  isStopping,
  onStop,
  language,
  className,
}: {
  progress: ReadProgress;
  isStopping: boolean;
  onStop: () => void;
  language?: string;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const shownAt = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - shownAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  // `done` counts finished files, so the one in hand is the next index.
  // Clamped, or the last one reads "3 of 2" for the moment between its result
  // landing and the pass ending.
  const at = progress ? Math.min(progress.done + 1, total) : 0;
  const loading = progress?.note === GETTING_READER;

  return (
    <div className={cn("border-border rounded-card bg-surface-alt border px-[18px] py-3.5", className)}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <LoaderCircle
            className="text-info mt-[3px] h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            strokeWidth={2}
          />
          <div className="min-w-0">
            {/* The count is what a screen reader hears, once per file. */}
            <div className="text-ink text-sm leading-[1.5]" aria-live="polite">
              {loading
                ? `Getting the reader${language ? ` for ${language}` : ""}.`
                : total > 0
                  ? `Reading ${at} of ${total}.`
                  : "Reading."}
            </div>
            <div className="text-ink-muted mt-[3px] text-[13px] leading-[1.55]">
              {loading
                ? "A one-time download for this language, then it starts. "
                : progress?.note
                  ? `${progress.note}. `
                  : ""}
              Copy and Download take whatever is read so far.
              <span className="font-mono text-[11.5px] tabular-nums"> {clock(elapsed)}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (Date.now() - shownAt.current < STOP_GUARD_MS) return;
            onStop();
          }}
          disabled={isStopping}
          className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt ml-7 inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 self-start border px-4 text-[13.5px] font-medium transition-colors duration-150 hover:bg-[oklch(var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60 sm:ml-0 sm:self-auto"
        >
          <Square className="h-3.5 w-3.5" strokeWidth={2.5} />
          {isStopping ? "Stopping..." : "Stop reading"}
        </button>
      </div>
    </div>
  );
}

function GapMark({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      aria-hidden
      className="text-info mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border border-[oklch(var(--info)/0.42)] bg-[oklch(var(--info)/0.13)]"
    >
      <Icon className="h-[13px] w-[13px]" strokeWidth={2.2} />
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The sentence for how the last pass ended, or null when the ledger already
 * says it. A stop and a failure with a cause get one; a pass that simply ran
 * to the end is reported by the ledger's own rows.
 */
export function passOutcome(lastPass: LastPass, stopped: boolean): string | null {
  if (!lastPass) return null;
  if (stopped) {
    return lastPass.read === 0
      ? "Stopped before any file was read."
      : `Stopped after reading ${lastPass.read} of ${lastPass.total}. ${lastPass.read === 1 ? "That one is" : "Those are"} in the bundle.`;
  }
  if (lastPass.failure === "offline") {
    return lastPass.read === 0
      ? "Couldn't get the reader. Check your connection, then read again."
      : `The connection dropped after ${lastPass.read} of ${lastPass.total}. Check it, then read the rest.`;
  }
  if (lastPass.failure === "memory") {
    return "The tab ran out of memory. Close other tabs, then read the rest.";
  }
  return null;
}

/**
 * The bar's offers (Q5): one row per kind no pass has been over yet, each
 * starting its pass straight from the result screen.
 */
export function offersFor(
  paths: { images: string[]; speech: string[]; scans: string[] },
  scope: { previewed: number; pagesLeft: number | null },
  stopped: boolean,
  read: (paths: string[]) => void,
): ReadingOffer[] {
  const { images, speech, scans } = paths;
  const offers: ReadingOffer[] = [];
  if (images.length > 0) {
    offers.push({
      key: "images",
      icon: ImageIcon,
      text: `${images.length} ${images.length === 1 ? "image" : "images"} might be holding text. Reading takes a few seconds each, here in your browser.`,
      label: "Read text",
      onRead: () => read(images),
    });
  }
  if (speech.length > 0) {
    offers.push({
      key: "speech",
      icon: AudioLines,
      text: `${speech.length} ${speech.length === 1 ? "recording" : "recordings"} can be written out. The first time downloads a speech model (66 MB for English, 244 MB for other languages).`,
      label: "Transcribe",
      onRead: () => read(speech),
    });
  }
  if (scans.length > 0) {
    // Stated in pages, the one thing a reader can weigh the wait by (Q112 O1).
    const { previewed, pagesLeft } = scope;
    const noun = scans.length === 1 ? "document" : "documents";
    const pages =
      pagesLeft === null ? "" : ` (${pagesLeft.toLocaleString("en-US")} ${pagesLeft === 1 ? "page" : "pages"})`;
    offers.push({
      key: "scans",
      icon: ScanText,
      text:
        previewed > 0
          ? `Read the first pages of ${previewed === scans.length ? "" : `${previewed} of `}${scans.length} ${noun}. The rest${pages} is not read yet, a few seconds a page.`
          : `${scans.length} ${noun} not read yet${pages}. Reading takes a few seconds a page.`,
      label: previewed > 0 || stopped ? "Read the rest" : "Read them",
      onRead: () => read(scans),
    });
  }
  return offers;
}
