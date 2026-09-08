/**
 * `<UnitFlip>` shows one result counted two ways, where the two counts tell
 * opposite stories.
 *
 * Both units grow outward from a single centre line, so the crossing is a shape
 * rather than six numbers to compare in your head. The two colours are
 * categorical and carry no valence: neither unit is the correct one, which is
 * the whole finding, and colouring one as good would take a side.
 *
 * On a phone the two units stack per row with a labelled track each, because a
 * mirrored pair at 390px leaves neither side room to be read.
 */

export type UnitFlipRow = {
  label: string;
  /** Share for the first unit, 0 to 1. */
  a: number;
  /** Share for the second unit, 0 to 1. */
  b: number;
  /** Supporting count, for example "fired in 58 of 60". */
  note?: string;
};

export type UnitFlipProps = {
  label: string;
  /** The two unit names, left then right. */
  units: [string, string];
  rows: UnitFlipRow[];
  /** The sentence the figure exists to produce. Sits inside it, not under it. */
  verdict?: string;
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const A_FILL = "oklch(var(--chart-2))";
const B_FILL = "oklch(var(--chart-5))";

function Swatch({ fill }: { fill: string }) {
  return <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: fill }} />;
}

export function UnitFlip({ label, units, rows, verdict }: UnitFlipProps) {
  return (
    <figure className="rounded-chip border-border bg-card my-8 border p-3.5 sm:px-[22px] sm:py-5">
      <figcaption className="text-ink mb-3.5 text-[14px] leading-[1.4] sm:mb-4 sm:text-[14.5px]">
        {label}
      </figcaption>

      <div className="border-border hidden grid-cols-[1fr_1px_1fr] items-center border-b pb-2.5 sm:grid">
        <span className="flex items-center gap-2 justify-self-start">
          <Swatch fill={A_FILL} />
          <span className="text-ink-secondary font-mono text-[11px]">{units[0]}</span>
        </span>
        <span />
        <span className="flex items-center gap-2 justify-self-end">
          <span className="text-ink-secondary font-mono text-[11px]">{units[1]}</span>
          <Swatch fill={B_FILL} />
        </span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`py-3.5 first:pt-0 sm:pb-3.5 sm:pt-4 sm:first:pt-4 ${
            i < rows.length - 1 ? "border-hairline border-b" : ""
          }`}
        >
          <div className="mb-2 flex items-baseline justify-between gap-2.5 sm:mb-[9px] sm:gap-3.5">
            <span className="text-ink text-[14px] sm:text-[14.5px]">{row.label}</span>
            {row.note ? (
              <span className="text-ink-faint font-mono text-[10.5px] sm:text-[11px]">
                {row.note}
              </span>
            ) : null}
          </div>

          {/* Mirrored pair, sm and up. */}
          <div className="hidden grid-cols-[1fr_1px_1fr] items-center sm:grid">
            <div className="grid grid-cols-[52px_1fr] items-center gap-2.5">
              <span className="text-ink-secondary text-right font-mono text-[12px] tabular-nums">
                {pct(row.a)}
              </span>
              <span className="flex justify-end">
                <span
                  className="h-4 rounded-l-sm"
                  style={{ width: `${row.a * 100}%`, background: A_FILL }}
                />
              </span>
            </div>
            <span className="bg-border-strong h-[30px] w-px" />
            <div className="grid grid-cols-[1fr_52px] items-center gap-2.5">
              <span className="flex">
                <span
                  className="h-4 rounded-r-sm"
                  style={{ width: `${row.b * 100}%`, background: B_FILL }}
                />
              </span>
              <span className="text-ink-secondary font-mono text-[12px] tabular-nums">
                {pct(row.b)}
              </span>
            </div>
          </div>

          {/* Stacked, below sm. */}
          <div className="sm:hidden">
            {(
              [
                [units[0], row.a, A_FILL],
                [units[1], row.b, B_FILL],
              ] as const
            ).map(([unit, value, fill], j) => (
              <div key={unit} className={j === 0 ? "mb-[9px]" : ""}>
                <div className="mb-1.5 grid grid-cols-[1fr_46px] items-center gap-2">
                  <span className="bg-hairline flex h-3.5 rounded-sm">
                    <span
                      className="h-3.5 rounded-sm"
                      style={{ width: `${value * 100}%`, background: fill }}
                    />
                  </span>
                  <span className="text-ink-secondary text-right font-mono text-[11.5px] tabular-nums">
                    {pct(value)}
                  </span>
                </div>
                <div className="text-ink-faint font-mono text-[10px]">{unit}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {verdict ? (
        <p className="rounded-chip bg-surface-inset border-border text-ink mt-1.5 border px-4 py-3.5 text-[14px] leading-[1.55] sm:text-[15px]">
          {verdict}
        </p>
      ) : null}
    </figure>
  );
}
