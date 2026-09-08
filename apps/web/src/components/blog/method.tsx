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
};

/**
 * One anchor, hardcoded on both sides. It used to be a prop, and a post that
 * gave the compact form one value and the full block another shipped a link to
 * an element that did not exist. An article carries one method, so the id was
 * never a choice worth offering.
 */
const ANCHOR = "method";

/**
 * First clause only. The full sentence belongs in the full block. Split on
 * comma-space or period-space, never on the bare comma: every field here
 * carries counts, and "48,200 files" would otherwise compact down to "48".
 *
 * Period-space matters for the fields that open with a verdict rather than a
 * value, such as a tokenizer field reading "Not applicable. This measures
 * recovered text, not tokens", which a comma-only split leaves cut mid-sentence.
 */
const clause = (value: string) => value.split(/,\s|\.\s/)[0];

export function Method({
  dataset,
  sample,
  measured,
  build,
  tokenizer,
  script,
  excludes,
  compact = false,
}: MethodProps) {
  if (compact) {
    /**
     * A grid, not a line. The single line was tried and it wrapped: between
     * about 400px and 620px the last value landed alone on a second row with
     * the link pushed hard right, leaving a gap that read as a bug. A grid
     * decides the column count, so no value can ever orphan at any width.
     */
    const fields: [string, string][] = [
      ["dataset", clause(dataset)],
      ["sample", clause(sample)],
      ["tokenizer", clause(tokenizer)],
      ["measured", measured],
    ];
    return (
      <div className="bg-surface-alt border-border rounded-chip my-8 border px-3.5 py-3 sm:px-4">
        <div className="border-hairline mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
          <span className="text-ink text-[14.5px] font-semibold">Method</span>
          {/*
            The link leaves the monospace run entirely: body font, larger than
            the values, solid underline. It used to sit in the same mono line at
            the same size with only colour to separate it, which read as one
            more measured value rather than as a control.
          */}
          <a
            href={`#${ANCHOR}`}
            className="text-go-fg hover:text-ink text-[13.5px] underline decoration-solid underline-offset-4 transition-colors"
          >
            Read the full method
          </a>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-faint font-mono text-[10px] uppercase tracking-[0.12em]">
                {label}
              </dt>
              <dd className="text-ink-secondary mt-1 font-mono text-[12px] leading-[1.45]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
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
    <div
      id={ANCHOR}
      className="bg-surface-alt border-border rounded-chip my-8 scroll-mt-24 border px-[18px] py-1"
    >
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
            // min-w-0: a grid item defaults to min-width:auto, which refuses to
            // shrink below its longest unbroken run, so a script path pushed the
            // whole page sideways at 320px however hard break-words tried.
            className={`min-w-0 break-words font-mono text-[12.5px] leading-[1.6] tabular-nums ${
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
