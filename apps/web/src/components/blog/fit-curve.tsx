import { scaleLog } from "@visx/scale";

/**
 * `<FitCurve>` answers one question with one picture: how many of the
 * repositories we measured fit in a given context window, and by how much the
 * rest miss.
 *
 * One row per repository, sorted smallest to largest, on a log axis. The count
 * that fits a window is the number of bars ending left of its line, so the
 * headline number is read off the chart rather than printed underneath it. The
 * block this replaces put those four counts in a plain text legend, which is
 * the one thing a figure must never do.
 *
 * Positions are CSS percentages from a real log scale rather than an SVG
 * viewBox. The chart is text at several sizes over a field of marks, and a
 * viewBox scales type with the drawing: at the widths this figure actually
 * renders at, an 11px axis tick would land anywhere between 9px and 14px. This
 * way every label is the size it says it is, at every width, and the whole
 * thing is in the first SSR chunk with no measurement step.
 */

export type FitThreshold = {
  /** Short name, for example "128K window". */
  label: string;
  value: number;
};

export type FitCurveProps = {
  /** What the rows are. Rendered as the figure's caption. */
  label: string;
  /** One measured value per row. Sorted here, so callers need not. */
  values: number[];
  thresholds: FitThreshold[];
  /** Population and date. Mono, under the plot. */
  source?: string;
  /**
   * The reader's own measurement. When present their row joins the sort, the
   * chart gains a marker and a readout, and everything else recedes one step.
   */
  you?: number;
};

/** Decade ticks covering the data, with a little air at both ends. */
function decades(min: number, max: number) {
  const from = Math.floor(Math.log10(min));
  const to = Math.ceil(Math.log10(max));
  const out: number[] = [];
  for (let e = from; e <= to; e++) out.push(10 ** e);
  return out;
}

const tickLabel = (v: number) =>
  v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1000 ? `${v / 1000}k` : String(v);

/**
 * Two label tiers, alternating. 128K and 200K sit a fifth of a decade apart,
 * which is closer than either label is wide, so a single row of labels would
 * always collide on exactly the pair the article cares about most.
 */
const TIER_GAP = 9;

export function FitCurve({ label, values, thresholds, source, you }: FitCurveProps) {
  const sorted = [...values].sort((a, b) => a - b);
  const lo = Math.min(sorted[0], you ?? Infinity);
  const hi = Math.max(sorted[sorted.length - 1], you ?? 0);
  const ticks = decades(lo, hi);
  const scale = scaleLog<number>({
    domain: [ticks[0], ticks[ticks.length - 1]],
    range: [0, 100],
  });
  const at = (v: number) => scale(v);

  // The reader's row joins the sort rather than floating above it, so their
  // position is read the same way every other row is.
  const rows = you ? [...sorted, you].sort((a, b) => a - b) : sorted;
  const fitsBelow = thresholds[0]?.value ?? Infinity;
  const smaller = you ? sorted.filter((v) => v < you).length : 0;

  const marked = you !== undefined;
  const barFit = marked ? "bg-[oklch(var(--text-faint))]" : "bg-[oklch(var(--go))]";
  const barMiss = marked ? "bg-[oklch(var(--border-strong))]" : "bg-[oklch(var(--text-faint))]";

  const placed = thresholds.map((t, i, all) => ({
    ...t,
    x: at(t.value),
    fits: values.filter((v) => v <= t.value).length,
    tier: i > 0 && at(t.value) - at(all[i - 1].value) < TIER_GAP ? 1 : 0,
  }));

  return (
    <figure className="fc-breakout rounded-chip border-border bg-card my-9 border px-4 py-4 sm:px-6 sm:py-5">
      <figcaption className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-ink font-mono text-[11px] uppercase tracking-[0.1em]">{label}</span>
        <span className="text-ink-faint font-mono text-[10.5px]">
          {rows.length} rows / log scale
        </span>
      </figcaption>

      <div className="relative">
        {/* Threshold rules run the full height of the label band and the rows, so
            a label is always attached to the line it names. */}
        {placed.map((t) => (
          <span
            key={t.label}
            aria-hidden="true"
            className={`absolute top-0 bottom-0 w-px border-l border-dashed ${
              marked ? "border-[oklch(var(--hairline))]" : "border-[oklch(var(--border-strong))]"
            }`}
            style={{ left: `${t.x}%` }}
          />
        ))}
        {marked ? (
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-[2px] bg-[oklch(var(--go))]"
            style={{ left: `${at(you)}%` }}
          />
        ) : null}

        {/* Label band. Kept above the rows rather than over them: sorted rows fill
            the lower left of the plot, so a label anchored in place would sit on
            data for exactly the thresholds that matter. */}
        <div className="relative h-[62px]">
          {placed.map((t) => (
            <span
              key={t.label}
              // A label grows away from the edge it is near, so it reads as
              // belonging to the side of the line its count describes and can
              // never run off the plot. Anchoring every label the same way
              // pushed the last two off the right edge at 358px.
              className={`absolute whitespace-nowrap ${t.x >= 50 ? "pr-2 text-right" : "pl-2"}`}
              style={
                t.x >= 50
                  ? { right: `${100 - t.x}%`, top: t.tier === 1 ? 30 : 0 }
                  : { left: `${t.x}%`, top: t.tier === 1 ? 30 : 0 }
              }
            >
              <span
                className={`block font-mono text-[10.5px] ${
                  marked ? "text-ink-faint" : "text-neutral-info"
                }`}
              >
                {t.label}
              </span>
              <span
                className={`block font-mono text-[12.5px] font-semibold tabular-nums ${
                  marked ? "text-ink-muted" : "text-ink"
                }`}
              >
                {t.fits} of {values.length}
              </span>
            </span>
          ))}
        </div>

        <div className="border-border-strong relative border-b border-l pl-px">
          {rows.map((v, i) => {
            const mine = marked && v === you;
            return (
              <span
                key={`${v}-${i}`}
                aria-hidden="true"
                className={`mb-px block h-[2.5px] rounded-r-[1px] ${
                  mine ? "bg-[oklch(var(--go))]" : v <= fitsBelow ? barFit : barMiss
                }`}
                style={{ width: `${Math.max(at(v), 0.4)}%` }}
              />
            );
          })}
        </div>

        <div className="relative h-[18px]">
          {ticks.map((t, i) => {
            const last = i === ticks.length - 1;
            return (
              <span
                key={t}
                className={`text-ink-faint absolute top-1 font-mono text-[10.5px] ${
                  // The end ticks sit against the plot edges, so centring them on
                  // their own gridline hangs half the label outside the figure.
                  i === 0 ? "" : last ? "-translate-x-full" : "-translate-x-1/2"
                } ${
                  // Alternate decades are dropped below `sm`: five ticks do not
                  // fit in 358px without rotating them or letting them touch.
                  i % 2 === 1 && !last ? "hidden sm:block" : ""
                }`}
                style={{ left: `${at(t)}%` }}
              >
                {tickLabel(t)}
              </span>
            );
          })}
        </div>
      </div>

      {marked ? <Readout you={you} smaller={smaller} of={values.length} placed={placed} /> : null}

      {source ? (
        <p className="text-ink-faint mt-4 font-mono text-[10.5px] leading-[1.5]">{source}</p>
      ) : null}
    </figure>
  );
}

/**
 * What the reader's own number means, in the two terms the article is about:
 * where they sit in the sample, and which windows they clear. Split into fits
 * and does not fit because that is the decision the number is for.
 */
function Readout({
  you,
  smaller,
  of,
  placed,
}: {
  you: number;
  smaller: number;
  of: number;
  placed: { label: string; value: number }[];
}) {
  const fits = placed.filter((t) => you <= t.value);
  const misses = placed.filter((t) => you > t.value);
  const short = (label: string) => label.replace(/\s*window$/, "");

  return (
    <div className="border-border-strong mt-5 grid gap-4 border-t pt-4 sm:grid-cols-[1fr_auto] sm:gap-8">
      <div>
        <p className="text-ink font-display text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {you.toLocaleString("en-US")}
        </p>
        <p className="text-ink-secondary mt-2 text-[15px] leading-[1.5]">
          Your folder is bigger than {smaller} of the {of} repositories we measured.
        </p>
      </div>
      <div className="flex gap-8">
        {[
          { head: "fits", rows: fits, tone: "text-go-fg" },
          { head: "does not fit", rows: misses, tone: "text-info" },
        ].map((col) => (
          <div key={col.head}>
            <p className="text-ink-faint mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
              {col.head}
            </p>
            {col.rows.length === 0 ? (
              <p className="text-ink-faint font-mono text-[12px]">none</p>
            ) : (
              col.rows.map((t) => (
                <p key={t.label} className={`font-mono text-[12.5px] leading-[1.6] ${col.tone}`}>
                  {short(t.label)}
                </p>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
