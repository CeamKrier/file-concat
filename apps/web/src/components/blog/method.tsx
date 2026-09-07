/**
 * `<Method>` is the fixed specification block every research and experiment
 * article carries: the same seven fields in the same order, so two measurements
 * can be compared and a stranger can repeat one.
 *
 * It appears twice in an article. `compact` sits under the opening paragraph as
 * one line with a link down to the full block, which lives just before the
 * limitations. The compact line takes the first clause of each field, so both
 * forms stay driven by one set of props and cannot drift apart.
 */

export type MethodProps = {
  /** What was measured over. */
  dataset: string;
  /** How much of it. */
  sample: string;
  /** ISO date the measurement ran. */
  measured: string;
  /** Version and commit the numbers came from. */
  build: string;
  tokenizer: string;
  /** Path to the script that produced the numbers. */
  script: string;
  /** What this measurement does not cover. */
  excludes: string;
  compact?: boolean;
  /** Anchor for the full block, and the compact form's link target. */
  id?: string;
};

/**
 * First clause only. The full sentence belongs in the full block. Split on
 * comma-space, never on the bare comma: every field here carries counts, and
 * "48,200 files" would otherwise compact down to "48".
 */
const clause = (value: string) => value.split(", ")[0];

export function Method({
  dataset,
  sample,
  measured,
  build,
  tokenizer,
  script,
  excludes,
  compact = false,
  id = "method",
}: MethodProps) {
  if (compact) {
    const parts = [clause(dataset), clause(sample), tokenizer, measured];
    return (
      <div className="bg-surface-alt border-border rounded-chip text-ink-muted my-8 flex flex-wrap items-baseline gap-x-3.5 gap-y-2 border px-3.5 py-[11px] font-mono text-[11.5px] leading-[1.6]">
        <span className="text-ink-faint">Method</span>
        {parts.map((part, i) => (
          <span key={part} className="contents">
            {i > 0 ? <span className="text-border-strong">|</span> : null}
            <span className="text-ink-secondary">{part}</span>
          </span>
        ))}
        <a href={`#${id}`} className="text-primary ml-auto">
          full method
        </a>
      </div>
    );
  }

  const rows: [string, string, boolean?][] = [
    ["dataset", dataset],
    ["sample", sample],
    ["measured", measured],
    ["build", build],
    ["tokenizer", tokenizer],
    ["script", script],
    ["excludes", excludes, true],
  ];

  return (
    <div id={id} className="bg-surface-alt border-border rounded-chip my-8 border px-[18px] py-1">
      {rows.map(([label, value, dim], i) => (
        <div
          key={label}
          className={`grid grid-cols-[minmax(84px,110px)_1fr] items-baseline gap-x-5 gap-y-1 py-[13px] ${
            i < rows.length - 1 ? "border-border border-b" : ""
          }`}
        >
          <span className="text-ink-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
            {label}
          </span>
          <span
            className={`break-words font-mono text-[12.5px] leading-[1.6] tabular-nums ${
              dim ? "text-ink-muted" : "text-code"
            }`}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
