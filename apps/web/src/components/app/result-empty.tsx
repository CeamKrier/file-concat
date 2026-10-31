import {
  Archive,
  AudioLines,
  FileQuestion,
  FilterX,
  FolderX,
  ImageOff,
  Languages,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { EmptyKind, UnreadableGroup } from "./empty-kind";
import type { PrunedAtDoor } from "~/lib/prune-at-door";
import { cn } from "~/lib/utils";
import { ReadingBar } from "./reading-bar";

type ResultEmptyProps = {
  droppedFiles: string[];
  kind?: EmptyKind;
  /** What the door turned away unread; the chips for the `pruned` variant. */
  pruned?: PrunedAtDoor | null;
  /**
   * The files nobody could read, grouped by why. Only read for `other`, where
   * it replaces the extension chips and names the files in its title.
   */
  unreadable?: UnreadableGroup[];
  onStartOver: () => void;
  /** Open the Files pane. Only passed when something is there to re-include. */
  onAdjust?: () => void;
  /**
   * True when an include pattern is what emptied the bundle. Only read for
   * `filtered`, and only to swap the body: the title and the CTA are true
   * either way, and the ignore-pattern wording is not.
   */
  byInclude?: boolean;
  /** True while a recognition pass is running. Only ever set for `scanned`. */
  isReading?: boolean;
  /** Recognition progress, or null when idle. */
  readProgress?: { done: number; total: number; note?: string } | null;
  /** True when the last pass ended on a stop rather than on its own. */
  stoppedReading?: boolean;
  /** True while a stop is asked for and the pass has not ended yet. */
  isStopping?: boolean;
  /**
   * True when no pass has been started over these at all, because the drop was
   * too big to read unasked. Distinct from `stoppedReading`, and from neither
   * being set: those mean "tried some" and "tried, found nothing", and both
   * would be untrue here.
   */
  readDeferred?: boolean;
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
  /**
   * For `guessed`: how many images were read, how many came back with writing
   * under the confidence floor, the language of the pass, and the first of
   * those readings to show.
   */
  guess?: { read: number; guessed: number; language: string; sample: { name: string; text: string } | null };
  /** Put the guesses in the bundle. Only for `guessed`. */
  onIncludeGuesses?: () => void;
  /** True once recognition has been over every image, so `image` says it looked. */
  imagesTried?: boolean;
};

// One rescue component, three voices, keyed by what was actually dropped. The
// tone is a heads-up (amber), never an error, and every variant offers a next
// step so the user is never at a dead end.
const COPY: Record<EmptyKind, { icon: LucideIcon; title: string; body: string; cta: string }> = {
  image: {
    icon: ImageOff,
    title: "These look like images, not text",
    body: "FileConcat bundles text (code, docs, configs and data) into one file. Images and binaries can't be combined this way, so nothing was left to pack.",
    cta: "Try a folder of files instead",
  },
  // Images, before anyone has looked. Not a dead end and not a promise either:
  // recognition reads writing off pixels, and whether these particular pixels
  // hold any is a thing only trying can settle (ADR-0017).
  recognisable: {
    icon: ScanText,
    title: "These are images",
    body: "Text can be read off them, here in your browser. FileConcat won't do it on its own, because an icon and a photographed page look alike until the work is done. It takes a few seconds an image, plus a one-time language download of under 4 MB.",
    cta: "Read them",
  },
  // Recordings, before anyone has listened. Offered like images, and for a
  // stronger reason: the first pass downloads a speech model.
  speech: {
    icon: AudioLines,
    title: "These are recordings",
    body: "The speech in them can be written out, and in a video the text shown on screen too, here in your browser. FileConcat won't start it on its own. The first time downloads a speech model (66 MB for English, 244 MB for other languages). Ten minutes of speech take under a minute to write out in English, about five in other languages.",
    cta: "Transcribe them",
  },
  archive: {
    icon: Archive,
    title: "That archive can't be opened here",
    body: "FileConcat unpacks .zip, .tar, .gz, .7z, .rar, .bz2 and .xz archives in your browser, but this one would not open. It may be damaged, password-protected, or packed with a method the browser's reader lacks. Unzip it on your computer, then drop the folder.",
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
    body: "Either the page is a picture of text, or its fonts carry no map from what is stored back to letters. Either way there are no characters in the file to pull out. Recognition reads the pixels instead: a few seconds a page, plus a one-time language download of under 4 MB.",
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
  // Turned away at the door, unread. The chips underneath name what was
  // refused, and the one way back in is the door's own rule: a folder dropped
  // by itself is read whatever it is called.
  pruned: {
    icon: FolderX,
    title: "Nothing here gets read",
    body: "Everything in this drop sits in a folder FileConcat never opens (dependencies, build output, caches) or is a kind of file that never holds text (fonts, media, compiled code). To read one of these folders anyway, drop it by itself.",
    cta: "Start over",
  },
  // Read, but under the confidence floor (Q134 O3). The body is built from the
  // counts and the language, so this one is only the title and the button.
  guessed: {
    icon: ScanText,
    title: "Read, but not with confidence",
    body: "",
    cta: "Include what it read",
  },
  other: {
    icon: FileQuestion,
    title: "Nothing text-like to combine",
    body: "FileConcat bundles text (code, docs, configs and data) and pulls the text out of PDFs and Office files. These look binary or hold no extractable text, so nothing was left to pack.",
    cta: "Start over",
  },
};

/**
 * `filtered`'s body, when an include pattern is what emptied the bundle rather
 * than an ignore rule. The default body names ignore patterns, .gitignore and
 * the hidden/oversize defaults, and for this case every one of those is a plain
 * untruth: nothing matched anything, the files fell *outside* a list instead.
 *
 * Worth its own sentence because the two are fixed in opposite directions —
 * one by removing a rule, the other by widening or clearing a list — and
 * because an include list survives in `fileconcat-config` between drops, so the
 * one doing this is often left over from an earlier drop.
 */
const FILTERED_BY_INCLUDE =
  "These files are readable. An include pattern is on and none of them matched it, so there was nothing to pack. It stays set between drops, so it may be left over from an earlier one.";

// `image` once recognition has been over the drop: the old body said nothing of
// it, which left a person who pressed Read with no idea whether it ran.
const IMAGE_AFTER_PASS =
  "Recognition read them here in your browser and found no writing in them. FileConcat bundles text, so there was nothing to pack.";

function guessedBody({ read, guessed, language }: { read: number; guessed: number; language: string }): string {
  const ran =
    read === 1
      ? `Recognition ran on this image in ${language}. It made out some writing but was unsure of most of it, so the text was left out.`
      : `Recognition ran on these ${read} images in ${language}. ${guessed === read ? `All ${read}` : `${guessed} of them`} had writing it could make out, but it was unsure of most of it, so the text was left out.`;
  return `${ran} A different language, a small screenshot or a picture with little writing in it can cause this. If you include it, the bundle marks it as a guess.`;
}

const MAX_EXT_CHIPS = 16;

// Aggregate what was dropped down to a count per extension. That's the signal
// worth surfacing when nothing combined — "lots of .heic → maybe worth
// supporting" — and it reads at a glance without putting anyone's actual
// filenames on screen. Sorted by frequency, ties broken alphabetically.
/**
 * The same chip row for what the door refused: folders first, as `dist/`,
 * then extensions by count. These are names from the default list and
 * extensions, never a path of anyone's, like the histogram beside it.
 */
function prunedChips(pruned: PrunedAtDoor): { ext: string; count: number }[] {
  const dirs = pruned.dirs.map((name) => ({ ext: `${name}/`, count: 1 }));
  const exts = [...pruned.exts.entries()]
    .map(([ext, { n }]) => ({ ext: ext === "none" ? "no extension" : `.${ext}`, count: n }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext));
  return [...dirs, ...exts];
}

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
  pruned = null,
  unreadable = [],
  onStartOver,
  onAdjust,
  byInclude = false,
  isReading = false,
  readProgress = null,
  stoppedReading = false,
  isStopping = false,
  readDeferred = false,
  onRead,
  onStopReading,
  onOfferRead,
  guess,
  onIncludeGuesses,
  imagesTried = false,
}: ResultEmptyProps) {
  const { icon: Icon, cta } = COPY[kind];
  const groups = kind === "other" ? unreadable : [];
  const unreadableCount = groups.reduce((n, g) => n + g.files.length, 0);
  const title =
    unreadableCount === 0
      ? COPY[kind].title
      : unreadableCount === 1
        ? "This file could not be read as text"
        : `None of these ${unreadableCount} files could be read as text`;
  const body =
    kind === "filtered" && byInclude
      ? FILTERED_BY_INCLUDE
      : kind === "guessed" && guess
        ? guessedBody(guess)
        : kind === "image" && imagesTried
          ? IMAGE_AFTER_PASS
          : COPY[kind].body;
  // The screen changes under the reading dialog as it closes, and the button
  // focus would return to is gone. The heading takes it, so a screen reader
  // reads what happened.
  const heading = useRef<HTMLHeadingElement>(null);
  const afterPass = kind === "guessed" || (kind === "image" && imagesTried);
  useEffect(() => {
    if (afterPass) heading.current?.focus();
  }, [afterPass]);
  const retry = onOfferRead
    ? { label: "Read again in another language", icon: Languages, onClick: onOfferRead }
    : null;
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
      : (kind === "recognisable" || kind === "speech") && onOfferRead
        ? { label: cta, icon: kind === "speech" ? AudioLines : ScanText, onClick: onOfferRead }
        : kind === "guessed" && onIncludeGuesses
          ? { label: cta, icon: null, onClick: onIncludeGuesses }
          : { label: cta, icon: null, onClick: onStartOver };
  // Every variant but `filtered` puts Start over in front, so Adjust underneath
  // is enough. `recognisable` is the exception: its front button is the offer,
  // so without this there is no way out of the screen except taking it.
  const secondary =
    kind === "filtered"
      ? (adjust ? startOver : null)
      : kind === "recognisable" || kind === "speech"
        ? startOver
        : afterPass && retry
          ? retry
          : adjust;
  // `guessed` keeps Start over too: its front button is the include, and the
  // page header has no way back of its own.
  const tertiary = kind === "guessed" ? startOver : null;
  const extensions = kind === "pruned" && pruned ? prunedChips(pruned) : extensionHistogram(droppedFiles);
  const shownExts = extensions.slice(0, MAX_EXT_CHIPS);
  const extraExts = extensions.length - shownExts.length;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-[560px] px-4 pt-12 text-center motion-reduce:animate-none">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[oklch(var(--info)/0.4)] bg-[oklch(var(--info)/0.12)]">
        <Icon className="text-info h-6 w-6" strokeWidth={2} />
      </span>

      <h2
        ref={heading}
        tabIndex={-1}
        className="font-display text-ink mt-4 text-2xl font-bold tracking-[-0.02em] focus:outline-none"
      >
        {title}
      </h2>
      <p className="text-ink-secondary mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed">
        {body}
      </p>

      {kind === "guessed" && guess?.sample && (
        <figure className="border-border bg-surface-inset mx-auto mt-5 max-w-[440px] rounded-[11px] border p-3.5 text-left">
          <figcaption className="text-ink-muted text-[12px]">What it read from {guess.sample.name}</figcaption>
          {/* File content, so masked in Clarity like the bundle preview. */}
          <p
            data-clarity-mask="True"
            className="text-ink mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed"
          >
            {guess.sample.text}
          </p>
        </figure>
      )}

      {groups.length > 0 && <UnreadableList groups={groups} />}

      {groups.length === 0 && kind !== "guessed" && shownExts.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {shownExts.map(({ ext, count }) => (
            <span
              key={ext}
              className="border-border bg-surface-alt text-ink-muted rounded-chip border px-2 py-1 font-mono text-[11px]"
            >
              {ext}
              {count > 1 && <span className="text-ink-faint"> x{count}</span>}
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
          stopping={isStopping}
          deferred={readDeferred}
          onRead={onRead}
          onStop={onStopReading}
          onStartOver={onStartOver}
          onAdjust={onAdjust}
        />
      ) : (kind === "recognisable" || kind === "speech") && isReading ? (
        // A pass someone started from the dialog, seen from the screen behind
        // it. The dialog carries its own stop; this one is for the case where it
        // was closed mid-pass.
        <InFlight progress={readProgress} stopping={isStopping} onStop={onStopReading} />
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
          {[secondary, tertiary].map(
            (action) =>
              action && (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </button>
              ),
          )}
        </div>
      )}
    </section>
  );
}

/** Rows shown per group before a "Show all N" toggle, as in the result's file groups. */
const PREVIEW_ROWS = 6;

/**
 * One group per reason. A reason every file in the group shares (encrypted,
 * compiled) is said once under the group's name; one that differs per file
 * (which format has no reader, how much of it is control bytes) sits under
 * each name.
 */
function UnreadableList({ groups }: { groups: UnreadableGroup[] }) {
  return (
    <div className="border-border bg-surface-inset mt-6 rounded-[11px] border p-3.5 text-left">
      {groups.map((group, i) => {
        const shared = group.files.every((f) => f.why === group.files[0].why);
        return (
          <section
            key={group.code}
            className={cn(i > 0 && "mt-3.5 border-t border-[oklch(var(--hairline))] pt-3.5")}
          >
            <h3 className="text-ink flex items-baseline gap-2 text-[13px] font-semibold">
              {group.label}
              <span className="text-ink-faint font-mono text-[11.5px] font-normal">{group.files.length}</span>
            </h3>
            {shared && <p className="text-ink-muted mt-1 text-[12.5px] leading-[1.5]">{group.files[0].why}</p>}
            <GroupFiles files={group.files} showWhy={!shared} />
          </section>
        );
      })}
    </div>
  );
}

function GroupFiles({ files, showWhy }: { files: UnreadableGroup["files"]; showWhy: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? files : files.slice(0, PREVIEW_ROWS);
  return (
    <>
      <ul
        className={cn(
          "mt-2 flex flex-col gap-[7px]",
          expanded && files.length > 10 && "max-h-56 overflow-y-auto pr-1",
        )}
      >
        {shown.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 font-mono text-xs">
            <span className="text-code min-w-0 flex-1 truncate">{f.name}</span>
            {showWhy && <span className="text-ink-muted min-w-0 font-sans text-[12.5px]">{f.why}</span>}
          </li>
        ))}
      </ul>
      {files.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-ink-faint hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-surface-inset mt-2 rounded-sm font-mono text-[11px] underline decoration-[oklch(var(--hairline))] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {expanded ? "Show less" : `Show all ${files.length}`}
        </button>
      )}
    </>
  );
}

/** A pass in flight, and the way out of it: the same reading bar the result
 * screen shows (Q5). Shared by both variants that can have one running. */
function InFlight({
  progress,
  stopping,
  onStop,
}: {
  progress: { done: number; total: number; note?: string } | null;
  stopping?: boolean;
  onStop?: () => void;
}) {
  return (
    <ReadingBar
      isReading
      progress={progress}
      isStopping={!!stopping}
      onStop={onStop ?? (() => {})}
      className="mx-auto mt-7 max-w-[520px] text-left"
    />
  );
}

/**
 * The scanned variant's action. Four states, in the order a person meets them:
 * deferred (the drop was too big to read unasked), running, stopped, and the
 * honest dead end when recognition found nothing either. A success never
 * renders here: the moment a document becomes readable the flow has a bundle,
 * and the result screen replaces this one.
 *
 * Deferred and stopped share their shape and not their words. Both offer the
 * pass, but "read the rest" is a plain untruth where there is no first part,
 * and the dead-end copy below would be a worse one: it says recognition looked
 * and found nothing, and here it never looked.
 */
function ReadAction({
  label,
  isReading,
  progress,
  stopped,
  stopping,
  deferred,
  onRead,
  onStop,
  onStartOver,
  onAdjust,
}: {
  label: string;
  isReading: boolean;
  progress: { done: number; total: number; note?: string } | null;
  stopped: boolean;
  stopping?: boolean;
  deferred?: boolean;
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
  if (isReading) return <InFlight progress={progress} stopping={stopping} onStop={onStop} />;

  // Never started, because starting would have meant a wait nobody agreed to.
  // The one state where the sentence has to say why nothing happened, or the
  // screen reads as a failure of the tool rather than a choice it left open.
  if (deferred) {
    return (
      <>
        <p className="text-ink-secondary mx-auto mt-6 max-w-[440px] text-[14px] leading-relaxed">
          Recognition did not read this drop on its own: it is large enough that the whole of it
          would have been a long wait nobody chose.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void onRead()}
            className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <ScanText className="h-4 w-4" strokeWidth={2} />
            Read them
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
      </>
    );
  }

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
