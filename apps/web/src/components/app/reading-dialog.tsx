import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, ScanText, Square } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

/** One file recognition can read — a scanned document or an image — as the
 * reading dialog needs to talk about it. */
export type ReadingDocument = {
  path: string;
  /** Basename, which is all anyone reads in a list. */
  name: string;
  /** What recognition made of it. Empty when it made nothing. */
  text: string;
  /** True once recognition has actually opened it, whatever came of that. */
  tried: boolean;
  /** The language this one was read in, named in English. Null when unread. */
  language: string | null;
};

type ReadingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: ReadingDocument[];
  /** The BCP-47 tag the last pass ran under, matched to an option. */
  language: string | null;
  languageOptions: { locale: string; code: string; name: string }[];
  isReading: boolean;
  progress: { done: number; total: number } | null;
  /** Run recognition over these paths, in this language. */
  onRead: (paths: readonly string[], locale: string) => Promise<number>;
  onStop: () => void;
  /** True between the stop being asked for and the pass ending. The page in
   * hand still has to come back, and a button silent across that gap reads as
   * a broken one. */
  isStopping?: boolean;
};

/**
 * Where a recognised reading can be checked and, if the language was wrong,
 * done again.
 *
 * It is a dialog rather than part of the result card for two reasons. Checking
 * is a focused job that wants the text at a readable size, not squeezed between
 * a summary and a Copy button. And the correction costs seconds a page and
 * rewrites the bundle underneath, which needs somewhere to happen that isn't
 * the result screen quietly changing under the cursor.
 *
 * The card that opens this carries the fact and nothing else. Every recognition
 * action after the drop itself lives here.
 */
export function ReadingDialog({
  open,
  onOpenChange,
  documents,
  language,
  languageOptions,
  isReading,
  progress,
  onRead,
  onStop,
  isStopping,
}: ReadingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[85vh] w-[calc(100%-2rem)] max-w-[640px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0">
        <DialogHeader className="border-b border-[oklch(var(--hairline))] px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="text-ink font-display text-lg font-bold tracking-[-0.01em]">
            Check the reading
          </DialogTitle>
          <DialogDescription className="text-ink-secondary text-[13px] leading-relaxed">
            Recognition guesses at characters, so a reading in the wrong language comes back looking
            like a success. This is what it made of each file.
          </DialogDescription>
        </DialogHeader>
        {/* Remounts on every open, so the selection and the language below start
            from the current state of the Run rather than from whatever was left
            behind last time. */}
        {open && (
          <ReadingPanel
            onClose={() => onOpenChange(false)}
            documents={documents}
            language={language}
            languageOptions={languageOptions}
            isReading={isReading}
            progress={progress}
            onRead={onRead}
            onStop={onStop}
            isStopping={isStopping}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A document's name and the language it was read in, doubling as the control
 * that unfolds its reading.
 *
 * The reading itself sits outside the button so it stays selectable: someone
 * checking a suspect line wants to copy it, and a button swallows the drag.
 */
function Header({
  document,
  open,
  bodyId,
  onToggle,
}: {
  document: ReadingDocument;
  open: boolean;
  bodyId: string;
  onToggle: (() => void) | null;
}) {
  const button = useRef<HTMLButtonElement>(null);

  // Opening a row folds the previous one away, and a row below it then jumps up
  // by however tall that reading was, which on a full transcript is most of a
  // screen. The row you asked for has to still be where you left it.
  useEffect(() => {
    if (open) button.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  // What tells two filenames apart lives at their end — "(2).docx", "-page3" —
  // and a plain truncate eats exactly that, which on a narrow screen turns six
  // copies into six identical rows. So the tail is held back from the ellipsis.
  const tail = Math.max(0, document.name.length - 10);

  const inside = (
    <>
      <span className="text-ink-secondary flex min-w-0 font-mono text-[11px]">
        <span className="truncate">{document.name.slice(0, tail)}</span>
        <span className="shrink-0">{document.name.slice(tail)}</span>
      </span>
      {/* Per document, not per pass. Reading one of them again in another
          language is the whole point of the scope, and after that there is no
          single language to name up on the card. */}
      {document.language && (
        <span className="text-ink-muted ml-auto shrink-0 text-[11px]">{document.language}</span>
      )}
    </>
  );

  if (!onToggle) return <div className="flex items-baseline gap-3">{inside}</div>;

  return (
    <button
      ref={button}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={bodyId}
      className="focus-visible:ring-ring focus-visible:ring-offset-surface group flex w-full items-baseline gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {inside}
      <ChevronDown
        className={cn(
          "text-ink-muted group-hover:text-ink h-3.5 w-3.5 shrink-0 self-center transition-transform duration-150 motion-reduce:transition-none",
          open && "rotate-180",
          !document.language && "ml-auto",
        )}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

function ReadingPanel({
  documents,
  language,
  languageOptions,
  isReading,
  progress,
  onRead,
  onStop,
  isStopping,
  onClose,
}: Omit<ReadingDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  // Documents that came back with nothing first. Drop order carries nothing
  // here, and these are the only ones that still need a decision.
  const ordered = useMemo(
    () => [...documents].sort((a, b) => Number(Boolean(a.text)) - Number(Boolean(b.text))),
    [documents],
  );

  // Unread documents if there are any, everything otherwise. Those are the two
  // reasons to be here: finish what was left, or redo what came out wrong.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const unread = documents.filter((d) => !d.text);
    return new Set((unread.length > 0 ? unread : documents).map((d) => d.path));
  });
  const [locale, setLocale] = useState(
    () => language ?? languageOptions.find((o) => o.code === "eng")?.locale ?? "en",
  );
  // One open at a time, so a drop of forty scans stays a list you can run your
  // eye down instead of a wall of forty transcripts. Everything starts folded,
  // because the two clamped lines are already the evidence: whether the
  // language was right is legible in the first line of any reading, and one
  // unfolded transcript fills the dialog and hides that there is a list at all.
  // A lone document has no list to hide, so it opens.
  const [openPath, setOpenPath] = useState<string | null>(() =>
    documents.length === 1 && ordered[0].text ? ordered[0].path : null,
  );

  // The button used to say the same thing before a pass and after it, so a
  // reading that had just happened looked like one that never did, and the move
  // the screen invited was to run it again. Nothing left to attempt means the
  // action here is a way out, until the selection or the language gives a
  // reason for another pass. Reading the same files again in the same language
  // is the one thing this dialog has no reason to offer.
  const [finished, setFinished] = useState(() => documents.every((d) => d.tried));
  // A stop leaves the rest unread, which is not a finished pass: the action
  // there is still "read", not a way out.
  const stopped = useRef(false);
  const wasReading = useRef(isReading);
  useEffect(() => {
    if (wasReading.current && !isReading) setFinished(!stopped.current);
    wasReading.current = isReading;
  }, [isReading]);

  // A single document has nothing to choose between, so the checkbox column is
  // noise: the one action is "read this again".
  const selectable = documents.length > 1;
  const paths = selectable ? ordered.filter((d) => selected.has(d.path)) : ordered;
  const allSelected = paths.length === documents.length;

  const toggle = (path: string) => {
    setFinished(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const action =
    "bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

  return (
    <>
      {/* The only scroll container in the dialog. Each reading used to carry a
          capped, scrollable box of its own, which put two scrollbars side by
          side and still stacked a screenful per document. */}
      <ul className="divide-y divide-[oklch(var(--hairline))] overflow-y-auto">
        {ordered.map((document, index) => {
          const open = openPath === document.path;
          // Off the index, not the path: a path holds spaces, which an id may
          // not.
          const bodyId = `reading-${index}`;
          return (
            <li key={document.path} className="flex items-start gap-3 px-5 py-3 sm:px-6">
              {selectable && (
                <input
                  type="checkbox"
                  checked={selected.has(document.path)}
                  onChange={() => toggle(document.path)}
                  disabled={isReading}
                  aria-label={`Read ${document.name}`}
                  className="accent-primary border-border-strong focus-visible:ring-ring focus-visible:ring-offset-surface mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}
              <div className="min-w-0 flex-1">
                <Header
                  document={document}
                  open={open}
                  bodyId={bodyId}
                  onToggle={
                    document.text
                      ? () => setOpenPath(open ? null : document.path)
                      : /* Nothing to unfold: the message below is one line and
                           always visible. */
                        null
                  }
                />
                {document.text ? (
                  /* Line breaks kept: they fall where the page broke, which is
                     most of what makes a scan recognisable as itself. Clamped
                     rather than capped-and-scrollable, because two lines
                     already say whether the language was right, and the whole
                     sample is bounded before it gets here. */
                  <p
                    id={bodyId}
                    className={cn(
                      "text-ink mt-1 whitespace-pre-wrap text-[13px] leading-relaxed",
                      !open && "line-clamp-2",
                    )}
                  >
                    {document.text}
                  </p>
                ) : (
                  <p className="text-ink-muted mt-1 text-[13px]">
                    {document.tried
                      ? "Nothing legible here. Encrypted, blank, or in a language this reading couldn't see."
                      : "Not read yet."}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="bg-surface-alt flex flex-col gap-3 border-t border-[oklch(var(--hairline))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-ink-secondary">Read as</span>
            <select
              value={locale}
              onChange={(e) => {
                setFinished(false);
                setLocale(e.target.value);
              }}
              disabled={isReading}
              className="border-border-strong bg-surface text-ink rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt border px-2 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60"
            >
              {languageOptions.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          {selectable && !isReading && (
            <button
              type="button"
              onClick={() => {
                setFinished(false);
                setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.path)));
              }}
              className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-alt rounded-sm px-1.5 py-1 text-[12px] underline decoration-[oklch(var(--hairline))] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>

        {isReading ? (
          <div className="flex items-center gap-3">
            <span className="text-ink-secondary flex items-center gap-2 text-[13px]" aria-live="polite">
              <LoaderCircle
                className="text-info h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                strokeWidth={2}
              />
              {/* `done` counts finished documents, so the one in hand is the
                  next index. Clamped, or the last one reads "3 of 2" for the
                  moment between its result landing and the pass ending. */}
              Reading
              {progress ? ` ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : ""}
              ...
            </span>
            <button
              type="button"
              onClick={() => {
                stopped.current = true;
                onStop();
              }}
              disabled={isStopping}
              className="bg-secondary text-ink border-border-strong rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-[13px] font-medium transition-colors duration-150 hover:bg-[oklch(var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-60"
            >
              <Square className="h-3.5 w-3.5" strokeWidth={2.5} />
              {isStopping ? "Stopping..." : "Stop"}
            </button>
          </div>
        ) : finished ? (
          <button type="button" onClick={onClose} className={action}>
            <Check className="h-4 w-4" strokeWidth={2.5} />
            Done
          </button>
        ) : (
          <button
            type="button"
            disabled={paths.length === 0}
            onClick={() => {
              stopped.current = false;
              void onRead(
                paths.map((d) => d.path),
                locale,
              );
            }}
            className={cn(action, paths.length === 0 && "cursor-not-allowed opacity-50")}
          >
            <ScanText className="h-4 w-4" strokeWidth={2} />
            {paths.length === 0
              ? "Nothing selected"
              : `Read ${paths.length} ${paths.length === 1 ? "file" : "files"}`}
          </button>
        )}
      </div>
    </>
  );
}
