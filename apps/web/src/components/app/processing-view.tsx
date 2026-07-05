type ProcessingViewProps = {
  /** 0–100 for determinate progress, or null while the total is unknown. */
  percent: number | null;
  /** The real phase in progress: "Reading files" / "Fetching files" / "Unpacking archive". */
  heading: string;
  /** Live count ("34 / 128 files") or the source identity — whichever is known. */
  detail: string;
};

/**
 * The "what's happening right now" moment. A spinner carrying the live percent
 * when we know the total, and a heading + detail that only ever say what is
 * actually happening — no scripted checklist, no invented steps.
 */
export function ProcessingView({ percent, heading, detail }: ProcessingViewProps) {
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
    </section>
  );
}
