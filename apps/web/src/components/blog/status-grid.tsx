/**
 * `<StatusGrid>` reports a re-test of our own tool: what is still broken, and
 * what used to be.
 *
 * The three open defects are the finding, so they are the first and loudest
 * thing and they are named in full. The thirteen closed ones are evidence that
 * the work happened, not something to read, so they collapse into one line of
 * ids the reader can open. The version this replaces printed all sixteen at
 * equal weight and asked the reader to find the three that mattered.
 *
 * Amber, never red. These are limits we found and published about ourselves,
 * and every one of them has a workaround in the same article.
 *
 * The disclosure is a native `<details>`, so the closed list is in the HTML a
 * crawler receives whether or not anybody opens it, and needs no JavaScript.
 */

export type StatusItem = {
  /** Stable id, for example "pdf-1.5". */
  id: string;
  /** One line, what the defect does to the output. */
  structure: string;
  severity?: "broken" | "degraded";
  status: "fixed" | "open";
};

export type StatusGroup = {
  /** File format the group covers, for example "pdf". */
  format: string;
  items: StatusItem[];
};

export type StatusGridProps = {
  /** Mono caption over the figure. */
  label: string;
  groups: StatusGroup[];
  /**
   * A correctness property that has held every round. Shown apart and outside
   * the count, because a property that never broke is not a defect.
   */
  guard?: { id: string; structure: string; label?: string };
};

export function StatusGrid({ label, groups, guard }: StatusGridProps) {
  const items = groups.flatMap((g) => g.items);
  const open = items.filter((i) => i.status === "open");
  const fixed = items.filter((i) => i.status === "fixed");
  // Counted from the items rather than taken as a prop: a headline that can
  // disagree with the rows under it is worse than no headline.
  const perFormat = groups
    .map((g) => ({ format: g.format, n: g.items.filter((i) => i.status === "fixed").length }))
    // A group whose defects are all still open contributes nothing here, and
    // listing it as "xlsx 0" reads as a count that failed rather than a group
    // with nothing closed in it.
    .filter((g) => g.n > 0)
    .map((g) => `${g.format} ${g.n}`)
    .join(" / ");

  return (
    <figure className="fc-breakout rounded-chip border-border bg-card my-9 border px-4 py-4 sm:px-5 sm:py-5">
      <figcaption className="border-hairline mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3">
        <span className="text-ink-faint font-mono text-[10.5px] uppercase tracking-[0.11em]">
          {label}
        </span>
        <span className="text-ink-muted font-mono text-[11px]">
          {fixed.length} fixed, {open.length} open
        </span>
      </figcaption>

      <p className="text-info font-display mb-3 text-[19px] font-semibold tracking-[-0.02em]">
        {open.length} still open
      </p>
      <ul className="space-y-2">
        {open.map((item) => (
          <li
            key={item.id}
            className="bg-surface-inset border-border grid gap-x-3 gap-y-1 rounded-[6px] border px-3.5 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-baseline"
          >
            <span className="flex items-baseline gap-2.5">
              <span
                aria-hidden="true"
                className="bg-info h-[7px] w-[7px] shrink-0 translate-y-[-1px] rounded-[1px]"
              />
              <span className="text-ink-muted font-mono text-[11.5px]">{item.id}</span>
              {item.severity ? (
                <span className="text-ink-faint font-mono text-[10.5px] sm:hidden">
                  {item.severity}
                </span>
              ) : null}
            </span>
            <span className="text-ink text-[15px] leading-[1.4] sm:text-[15.5px]">
              {item.structure}
            </span>
            {item.severity ? (
              <span className="text-ink-faint hidden font-mono text-[10.5px] sm:inline">
                {item.severity}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <details className="group border-hairline mt-5 border-t pt-3.5">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-ink text-[15px] font-semibold">{fixed.length} fixed</span>
          <span className="text-ink-faint font-mono text-[10.5px]">{perFormat}</span>
          <span className="text-go-fg ml-auto font-mono text-[11.5px] underline underline-offset-4">
            <span className="group-open:hidden">Show what each one was</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <ul className="mt-3.5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {fixed.map((item) => (
            <li key={item.id} className="flex items-baseline gap-2.5">
              <span className="text-ink-faint w-[62px] shrink-0 font-mono text-[10.5px]">
                {item.id}
              </span>
              <span className="text-ink-muted text-[13.5px] leading-[1.45]">{item.structure}</span>
            </li>
          ))}
        </ul>
      </details>

      {guard ? (
        <div className="bg-surface-alt mt-4 rounded-[6px] px-3.5 py-3">
          <p className="text-ink-faint mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
            {guard.label ?? `separate, not counted in the ${items.length}`}
          </p>
          <p className="text-ink-secondary text-[14px] leading-[1.5]">{guard.structure}</p>
        </div>
      ) : null}
    </figure>
  );
}
