import { Check } from "lucide-react";

import { cn } from "~/lib/utils";

/** One stage of the run, and whether it has run, is running, or is still to come. */
export type ProcessingStep = { label: string; state: "done" | "active" | "pending" };

type ProcessingViewProps = {
  /**
   * What is happening right now, when the rail below doesn't already say it:
   * a fetch narrates its own sub-stages ("Connecting...", "Downloading files")
   * inside the one stage. Empty when the rail carries the whole story.
   */
  heading: string;
  /** Live count ("34 / 128 files") or the source identity — whichever is known. */
  detail: string;
  /** Explains a stage slow enough to need explaining. Shown under the detail. */
  aside?: string;
  /** Abandon the current stage, when it is one that can be abandoned. */
  onStop?: () => void;
  /** What stopping is called, e.g. "Skip the scanned pages". */
  stopLabel?: string;
  /** True once stopping has been asked for and before the stage has ended. */
  stopping?: boolean;
  /**
   * The run's stages and where it has got to. Fewer than two hides the rail:
   * a single stage has nothing to place, and a lone row would only be the
   * heading again.
   */
  steps?: readonly ProcessingStep[];
};

/**
 * The "what's happening right now" moment. A spinner, the run's stages, and
 * the count the running one is at. No scripted checklist, no invented steps.
 *
 * There is no whole-run percent, because there is no honest one: the folder
 * walk has no total until it ends, an archive changes the file count mid-run,
 * and a page of recognition costs seconds where a file costs milliseconds. A
 * percent per stage is honest but restarts at every stage, which reads as the
 * drop starting over. So the exact counts stay, on the stage doing the
 * counting, and nothing claims to measure the whole run.
 */
export function ProcessingView({
  heading,
  detail,
  aside,
  onStop,
  stopLabel,
  stopping,
  steps,
}: ProcessingViewProps) {
  // One stage is not a sequence: the heading already says what is happening.
  const rail = steps !== undefined && steps.length > 1;
  return (
    <section className="animate-fade-up mx-auto flex w-full max-w-[560px] flex-col items-center px-4 pt-16 text-center motion-reduce:animate-none">
      <div className="relative h-[72px] w-[72px]">
        <div className="border-border absolute inset-0 rounded-full border-[3px]" />
        <div className="border-primary absolute inset-0 animate-spin rounded-full border-[3px] border-b-transparent border-l-transparent border-r-transparent" />
      </div>

      {heading && (
        <h2 className="font-display text-ink mt-6 text-[22px] font-bold tracking-[-0.02em]">
          {heading}
        </h2>
      )}
      {detail && !rail && (
        <p className="text-ink-muted mt-1 font-mono text-[13px] tabular-nums">{detail}</p>
      )}

      {/* Where in the run this stage sits. One screen for the whole thing:
          stages tick as they finish and recognition joins the end of the list
          when the read turns some up, rather than arriving as a second screen
          that looks like starting over. */}
      {rail && (
        <ol aria-label="Stages" className="mt-7 flex w-[340px] max-w-full flex-col gap-3">
          {steps.map(({ label, state }) => (
            <li
              key={label}
              aria-current={state === "active" ? "step" : undefined}
              className="flex items-center gap-2.5 text-left"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <Check className="text-primary h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <span
                    className={cn(
                      "rounded-full",
                      state === "active" ? "bg-primary h-2 w-2" : "bg-border h-1.5 w-1.5",
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-[15px]",
                  state === "active" ? "text-ink font-medium" : "text-ink-muted",
                )}
              >
                {label}
              </span>
              {/* The count belongs to the stage counting, not to a line of its
                  own: it is the one number that moves, and it moves inside a
                  fixed-width rail so nothing shifts as the digits grow. */}
              {state === "active" && detail && (
                <span className="text-ink-muted ml-auto whitespace-nowrap font-mono text-[12px] tabular-nums">
                  {detail}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* A stage worth waiting through has to say why it is worth waiting
          through, and offer the way past it in the same breath. */}
      {aside && (
        <p className="text-ink-secondary mx-auto mt-4 max-w-[420px] text-[14px] leading-relaxed">
          {aside}
        </p>
      )}
      {/* The press has to answer before the stage does. Stopping reaches the
          recogniser at once but the page in hand still has to come back, and a
          button that says nothing across that gap reads as a dead button. */}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          aria-live="polite"
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background mt-3 rounded-sm px-2 py-1 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60 disabled:hover:text-ink-muted"
        >
          {stopping ? "Stopping..." : (stopLabel ?? "Skip this step")}
        </button>
      )}
    </section>
  );
}
