/**
 * `<CompositionBar>` answers the second half of the funnel's question: not how
 * much was removed, but what it was. One stacked bar by share of tokens, with a
 * legend that carries the counts the shares came from.
 *
 * Excluded categories are hatched rather than merely tinted, so "kept" and
 * "never reaches the bundle" read as different in kind and not as two shades of
 * the same thing. Every value sits in the markup: nothing here is hover-only,
 * because these numbers get quoted.
 */

export type CompositionSegment = {
  label: string;
  tokens: number;
  /** Filtered out by default, so it never reaches the bundle. */
  excluded?: boolean;
};

export type CompositionBarProps = {
  segments: CompositionSegment[];
  /** Eyebrow. Defaults to "Composition, <total> tokens". */
  label?: string;
  /** Hide the excluded categories entirely, bar and legend both. */
  showExcluded?: boolean;
};

const num = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Green, blue, amber, violet, then a warm grey. Red is skipped: here it would read as failure. */
const KEPT_FILLS = [
  "oklch(var(--chart-1))",
  "oklch(var(--chart-2))",
  "oklch(var(--chart-3))",
  "oklch(var(--chart-5))",
  "oklch(var(--text-muted))",
];

const EXCLUDED_FILLS = [
  "repeating-linear-gradient(135deg,#4a4133 0 4px,#2c261d 4px 8px)",
  "repeating-linear-gradient(135deg,#413a2d 0 4px,#282218 4px 8px)",
  "repeating-linear-gradient(135deg,#39332a 0 4px,#241f18 4px 8px)",
  "repeating-linear-gradient(135deg,#322d25 0 4px,#201c15 4px 8px)",
];

/** Below this share an inline percentage inside the bar stops being readable. */
const INLINE_LABEL_FLOOR = 0.1;

function Swatch({ fill }: { fill: string }) {
  return <span className="h-3 w-3 rounded-[3px]" style={{ background: fill }} />;
}

function LegendRow({
  fill,
  label,
  tokens,
  share,
  dim,
}: {
  fill: string;
  label: string;
  tokens: number;
  share: number;
  dim?: boolean;
}) {
  return (
    <div className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-3">
      <Swatch fill={fill} />
      <span className={dim ? "text-ink-muted text-[13.5px]" : "text-ink text-[13.5px]"}>
        {label}
      </span>
      <span
        className={`min-w-[62px] text-right font-mono text-[12.5px] tabular-nums ${
          dim ? "text-ink-muted" : "text-ink-secondary"
        }`}
      >
        {num(tokens)}
      </span>
      <span className="text-ink-faint min-w-[40px] text-right font-mono text-[12.5px] tabular-nums">
        {pct(share)}
      </span>
    </div>
  );
}

export function CompositionBar({ segments, label, showExcluded = true }: CompositionBarProps) {
  const visible = showExcluded ? segments : segments.filter((s) => !s.excluded);
  const kept = visible.filter((s) => !s.excluded);
  const excluded = visible.filter((s) => s.excluded);

  const total = visible.reduce((sum, s) => sum + s.tokens, 0);
  const keptTokens = kept.reduce((sum, s) => sum + s.tokens, 0);
  const excludedTokens = total - keptTokens;
  const share = (tokens: number) => (total ? tokens / total : 0);

  const fill = (segment: CompositionSegment, index: number) =>
    segment.excluded
      ? EXCLUDED_FILLS[index % EXCLUDED_FILLS.length]
      : KEPT_FILLS[index % KEPT_FILLS.length];

  return (
    <div className="bg-surface border-border rounded-chip my-8 border p-5">
      <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-2">
        <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.16em]">
          {label ?? `Composition, ${num(total)} tokens`}
        </span>
        <span className="text-ink-muted font-mono text-[11px]">
          {visible.length} categories
        </span>
      </div>

      <div className="flex h-[30px] gap-px overflow-hidden rounded">
        {kept.map((segment, i) => {
          const s = share(segment.tokens);
          return (
            <span
              key={segment.label}
              className="flex items-center pl-[9px] font-mono text-[11px]"
              style={{
                width: pct(s),
                background: fill(segment, i),
                color: "oklch(var(--primary-foreground))",
              }}
            >
              {s >= 0.5 ? `${segment.label} ${pct(s)}` : s >= INLINE_LABEL_FLOOR ? pct(s) : ""}
            </span>
          );
        })}
        {excluded.map((segment, i) => (
          <span
            key={segment.label}
            style={{ width: pct(share(segment.tokens)), background: fill(segment, i) }}
          />
        ))}
      </div>

      {/* Captions sit at the two ends rather than under their exact spans: the
          excluded share is small enough that a percentage width would squeeze
          the label into an unreadable column on a phone. */}
      <div className="text-ink-faint mt-1.5 flex justify-between gap-3 pt-0.5 font-mono text-[10.5px]">
        <span>
          kept, {num(keptTokens)} tokens
        </span>
        {excluded.length ? <span>{num(excludedTokens)} excluded</span> : null}
      </div>

      <div className="mt-[22px] grid gap-[9px]">
        {kept.map((segment, i) => (
          <LegendRow
            key={segment.label}
            fill={fill(segment, i)}
            label={segment.label}
            tokens={segment.tokens}
            share={share(segment.tokens)}
          />
        ))}

        {excluded.length ? (
          <>
            <div className="border-border text-ink-faint mb-[3px] mt-1.5 border-t pt-[11px] font-mono text-[10.5px] uppercase tracking-[0.14em]">
              excluded by default
            </div>
            {excluded.map((segment, i) => (
              <LegendRow
                key={segment.label}
                fill={fill(segment, i)}
                label={segment.label}
                tokens={segment.tokens}
                share={share(segment.tokens)}
                dim
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
