type ProcessingViewProps = {
  /** 0–100 for determinate progress, or null while the total is unknown. */
  percent: number | null;
  /** The real phase in progress: "Reading files" / "Fetching files" / "Unpacking archive". */
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
};

/**
 * The "what's happening right now" moment. A spinner carrying the live percent
 * when we know the total, and a heading + detail that only ever say what is
 * actually happening — no scripted checklist, no invented steps.
 */
export function ProcessingView({
  percent,
  heading,
  detail,
  aside,
  onStop,
  stopLabel,
  stopping,
}: ProcessingViewProps) {
  return (
    <section className="animate-fade-up mx-auto flex w-full max-w-[560px] flex-col items-center px-4 pt-16 text-center motion-reduce:animate-none">
      <div className="relative h-[72px] w-[72px]">
        <div className="border-border absolute inset-0 rounded-full border-[3px]" />
        <div className="border-primary absolute inset-0 animate-spin rounded-full border-[3px] border-b-transparent border-l-transparent border-r-transparent" />
        {percent !== null && (
          <div className="text-ink absolute inset-0 flex items-center justify-center font-mono text-sm font-medium tabular-nums">
            {percent}%
          </div>
        )}
      </div>

      <h2 className="font-display text-ink mt-6 text-[22px] font-bold tracking-[-0.02em]">
        {heading}
      </h2>
      {detail && (
        <p className="text-ink-muted mt-1 font-mono text-[13px] tabular-nums">{detail}</p>
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
