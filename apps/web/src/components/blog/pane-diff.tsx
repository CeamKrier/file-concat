import type { ReactNode } from "react";

/**
 * `<PaneDiff>` shows one input read by two independent programs, side by side.
 *
 * A comparison, not a pipeline. There is no arrow and no glyph between the
 * panes and no order to them beyond left and right, because the version this
 * replaces pointed an arrow from one pane to the other and the first thing a
 * reader asked was whether we were compressing the file. Nothing here suggests
 * one pane becomes the other. Both are outputs of the same bytes.
 *
 * The difference is encoded rather than left for the reader to diff by eye:
 * every line is tinted by which column of the original page it came from, so
 * "ours keeps the columns, theirs interleaves them" is a shape you see before
 * you read a word of it.
 *
 * Long lines wrap inside their own column with the number holding its gutter.
 * No horizontal scrollbar and no truncation, so no word is ever cut in half.
 */

export type DiffPane = {
  /** Which program produced this output. */
  reader: string;
  /** What it did to the structure, in two or three words. */
  verdict: string;
  /** The output, one line per newline. */
  text: string;
  /** What the pane amounts to. Sits under the lines, mono and faint. */
  footer: string;
};

export type PaneDiffProps = {
  /** The input both readers were given. */
  file: string;
  /**
   * Lines beginning with this string came from the second origin and are
   * tinted. The origin really is identifiable from the text, which is why this
   * fixture separates a column model from luck in the first place.
   */
  mark: string;
  /** Names the two origins, in the order plain then tinted. */
  legend: [string, string];
  /** Lines the real output has, when the panes show only the first few. */
  total?: number;
  panes: [DiffPane, DiffPane];
  /** What the two panes amount to. Runs full width underneath. */
  children?: ReactNode;
};

function Pane({ pane, mark, total }: { pane: DiffPane; mark: string; total?: number }) {
  const lines = pane.text.split("\n");
  return (
    <div className="border-border bg-surface-cli overflow-hidden rounded-[6px] border">
      <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-3 py-2">
        <span className="text-ink font-mono text-[12.5px]">{pane.reader}</span>
        <span className="text-ink-muted font-mono text-[11px]">{pane.verdict}</span>
      </div>
      <div className="py-1.5">
        {lines.map((line, i) => {
          const tinted = line.startsWith(mark);
          return (
            <div
              key={i}
              className={`grid grid-cols-[26px_1fr] gap-x-1 px-2 py-[3px] ${
                tinted ? "bg-[oklch(var(--neutral-info)/0.16)]" : ""
              }`}
            >
              <span className="text-ink-faint text-right font-mono text-[10.5px] leading-[1.6] tabular-nums">
                {i + 1}
              </span>
              <span
                className={`whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.6] sm:text-[12px] ${
                  tinted ? "text-neutral-info" : "text-code"
                }`}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
      <p className="border-hairline text-ink-faint border-t px-3 py-2 font-mono text-[10.5px] leading-[1.4]">
        {lines.length}{total ? ` of ${total}` : ""} lines / {pane.footer}
      </p>
    </div>
  );
}

export function PaneDiff({ file, mark, legend, panes, total, children }: PaneDiffProps) {
  return (
    <figure className="fc-breakout rounded-chip border-border bg-card my-9 border px-4 py-4 sm:px-5 sm:py-5">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-ink font-mono text-[11px] uppercase tracking-[0.1em]">
          One file, two independent readers
        </span>
        <span className="text-ink-faint font-mono text-[10.5px]">{file}</span>
      </figcaption>

      <p className="mb-3.5 flex flex-wrap gap-x-5 gap-y-1">
        {legend.map((text, i) => (
          <span key={text} className="text-ink-muted flex items-center gap-2 font-mono text-[11px]">
            <span
              aria-hidden="true"
              className={`h-[9px] w-[9px] rounded-[2px] ${
                i === 0 ? "bg-[oklch(var(--code-text))]" : "bg-[oklch(var(--neutral-info))]"
              }`}
            />
            {text}
          </span>
        ))}
      </p>

      {/* Stacked below `sm`, ours first. Side by side the panes are read across,
          which is the comparison; stacked they are read down, which is why each
          one keeps its own header and footer. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {panes.map((pane) => (
          <Pane key={pane.reader} pane={pane} mark={mark} total={total} />
        ))}
      </div>

      {children ? (
        <div className="text-ink-secondary mt-4 text-[14.5px] leading-[1.55] sm:text-[15px]">
          {children}
        </div>
      ) : null}
    </figure>
  );
}
