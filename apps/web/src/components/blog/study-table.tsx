/**
 * `<StudyTable>` is the aggregated prior-work block every research article
 * carries: one row per published source, with what it compared and what it
 * found.
 *
 * Two column groups rather than five columns. The short identifying fields sit
 * on the left, the two long sentences on the right, and below the `sm`
 * breakpoint the same fields stack. A five-column markdown table is right at
 * 720px and unreadable at 390px, which is what this replaces.
 *
 * Nothing is truncated, ever: these are citations, and a cut citation is
 * worthless. A source that is not a study, such as vendor documentation, is
 * marked as a different kind of source at the same weight, because vendor
 * documentation is often the most actionable row on the page.
 */

export type Study = {
  /** Author and short title. */
  source: string;
  href?: string;
  /** Venue or "Vendor documentation". */
  venue: string;
  /** True when the row is documentation or a project README, not a study. */
  kind?: "study" | "vendor";
  /** Sample described in its own terms, or "Not a study". */
  sample: string;
  /** What was compared. */
  compared: string;
  /** The result, quoted or closely paraphrased. */
  headline: string;
};

export type StudyTableProps = {
  rows: Study[];
  /** Column heading over the two long fields. */
  label?: string;
};

export function StudyTable({
  rows,
  label = "what it compared, what it found",
}: StudyTableProps) {
  return (
    <figure className="rounded-chip border-border bg-card my-8 border p-4 sm:px-[22px] sm:py-5">
      <div className="border-border-strong hidden grid-cols-[232px_1fr] gap-[22px] border-b pb-2.5 sm:grid">
        <span className="text-ink-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
          source
        </span>
        <span className="text-ink-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.source}
          className={`grid gap-3.5 py-4 first:pt-0 sm:grid-cols-[232px_1fr] sm:gap-[22px] sm:first:pt-4 ${
            i < rows.length - 1 ? "border-hairline border-b" : "sm:pb-1"
          }`}
        >
          <div>
            {/*
              The link is styled here rather than inherited: these render inside
              a React component, so the MDX prose link rule never reaches them
              and the citations came out looking like plain headings.
            */}
            {row.href ? (
              <a
                href={row.href}
                className="text-go-fg hover:text-ink text-[15px] leading-[1.4] underline decoration-[oklch(var(--go-text)/0.5)] underline-offset-4 transition-colors hover:decoration-current"
              >
                {row.source}
              </a>
            ) : (
              <span className="text-ink text-[15px] leading-[1.4]">{row.source}</span>
            )}
            <div
              className={`mt-2.5 inline-block rounded-[5px] border px-2 py-[3px] font-mono text-[11px] ${
                row.kind === "vendor"
                  ? "text-neutral-info border-neutral-info/40"
                  : "text-ink-secondary border-border"
              }`}
            >
              {row.venue}
            </div>
            <div className="text-ink-muted mt-2.5 font-mono text-[11px] leading-[1.6]">
              {row.sample}
            </div>
          </div>
          <div>
            <p className="text-ink-secondary text-[14px] leading-[1.5]">{row.compared}</p>
            <p className="text-ink mt-2.5 text-[14.5px] leading-[1.5] sm:text-[15px]">
              {row.headline}
            </p>
          </div>
        </div>
      ))}
    </figure>
  );
}
