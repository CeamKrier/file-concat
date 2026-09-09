/**
 * `<ReaderDuel>` puts two independent programs against identical bytes and says
 * which loss belongs to the format and which was one reader's choice.
 *
 * Weight follows disagreement. A row where both readers succeed is one quiet
 * line; a row where they differ gets a panel, and that is the whole design. The
 * version this replaces gave every outcome the same outlined chip, so a row
 * that agreed and a row that disagreed were indistinguishable and the finding
 * was invisible. Nothing here is outlined, so nothing reads as a disabled
 * control either.
 *
 * Four outcome kinds. Both recovered, one recovered and the other did not, we
 * lost, and the comparison refused to answer. That last one is a real result
 * and gets the darkest surface in the figure with its reason written next to
 * it: it is the only cell carrying an explanation, so it can never be misread
 * as an empty cell.
 *
 * Amber, never red. These are documented limits we published about ourselves.
 */

export type DuelOutcome = {
  /** What the reader did, in words. For example "recovers", "loses". */
  text: string;
  /** recovered is green, lost is amber, absent is the dark well. */
  kind: "recovered" | "lost" | "absent";
  /** Absent only: why the comparison could not be scored. */
  note?: string;
};

export type DuelRow = {
  structure: string;
  a: DuelOutcome;
  b: DuelOutcome;
  /** Why the row exists. Runs full width under the outcomes. */
  verdict: string;
};

export type ReaderDuelProps = {
  label: string;
  /** The two reader names, in the order the outcomes are given. */
  readers: [string, string];
  rows: DuelRow[];
};

const agrees = (row: DuelRow) =>
  row.a.kind === row.b.kind && row.a.kind !== "absent" && row.b.kind !== "absent";
const scorable = (row: DuelRow) => row.a.kind !== "absent" && row.b.kind !== "absent";

function Cell({ outcome, reader }: { outcome: DuelOutcome; reader: string }) {
  return (
    <div className="min-w-0">
      <p className="text-ink-faint mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
        {reader}
      </p>
      {outcome.kind === "absent" ? (
        <div className="bg-surface-cli border-hairline rounded-[5px] border px-3 py-2">
          <p className="text-ink-muted font-mono text-[12px] leading-[1.4]">{outcome.text}</p>
          {outcome.note ? (
            <p className="text-ink-faint mt-0.5 font-mono text-[10.5px] leading-[1.4]">
              {outcome.note}
            </p>
          ) : null}
        </div>
      ) : (
        <p
          className={`rounded-[5px] px-3 py-2 font-mono text-[13px] font-semibold leading-[1.4] ${
            outcome.kind === "recovered"
              ? "bg-primary text-primary-foreground"
              : "bg-info text-[oklch(var(--background))]"
          }`}
        >
          {outcome.text}
        </p>
      )}
    </div>
  );
}

export function ReaderDuel({ label, readers, rows }: ReaderDuelProps) {
  const differ = rows.filter((r) => scorable(r) && !agrees(r)).length;
  const unscored = rows.filter((r) => !scorable(r)).length;
  const summary = [
    `${differ} of ${rows.length} disagree`,
    unscored > 0 ? `${unscored} not attributable` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <figure className="fc-breakout rounded-chip border-border bg-card my-9 border px-4 py-4 sm:px-5 sm:py-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-ink font-mono text-[11px] uppercase tracking-[0.1em]">{label}</span>
        <span className="text-ink-muted font-mono text-[11px]">{summary}</span>
      </figcaption>

      <div className="space-y-2.5">
        {rows.map((row) =>
          agrees(row) ? (
            // Agreement is one line on the quiet surface. It is evidence that the
            // corpus is fair, not a result, so it takes the space of a result.
            <div
              key={row.structure}
              className="bg-surface-alt flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[6px] px-3.5 py-2.5"
            >
              <p className="text-ink-secondary text-[14.5px] leading-[1.4]">
                <span className="text-ink-faint mr-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                  agree
                </span>
                {row.structure}
              </p>
              {/* The outcome verbatim, with no "both" in front of it: the row is
                  already labelled AGREE, and prefixing it needed the verb
                  conjugated, which "deduplicates" and "repeats all 3" do not
                  survive. Screen readers get the two names instead. */}
              <p className="text-go-fg font-mono text-[12px]">
                <span className="sr-only">
                  {readers[0]} and {readers[1]} both:{" "}
                </span>
                {row.a.text}
              </p>
            </div>
          ) : (
            <div
              key={row.structure}
              className="bg-surface-inset border-border rounded-[6px] border px-3.5 py-3.5 sm:px-4"
            >
              <p className="text-ink text-[16px] leading-[1.35] sm:text-[17px]">{row.structure}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4">
                <Cell outcome={row.a} reader={readers[0]} />
                <Cell outcome={row.b} reader={readers[1]} />
              </div>
              <p className="text-ink-muted mt-3 text-[14px] leading-[1.5]">{row.verdict}</p>
            </div>
          ),
        )}
      </div>
    </figure>
  );
}
