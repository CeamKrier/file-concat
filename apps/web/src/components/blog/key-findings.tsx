import { useState } from "react";

/**
 * `<KeyFindings>` is the block at the top of a research article that has to
 * survive being lifted out of it. The figure leads and the sentence follows, so
 * the numbers are scannable before the prose is read, and the snapshot line
 * carries the date and sample the block would otherwise lose on its way into
 * somebody else's quote.
 *
 * Rules, not decoration: every item carries a number, and the copy action hands
 * back one self-contained sentence rather than the article's URL. Not styled as
 * a `Callout`, which already means "aside" on this site.
 */

export type Finding = {
  /** The number itself, for example "0.24 to 1.13%". */
  figure: string;
  /** One sentence. The finding, not a description of the section. */
  text: string;
};

export type KeyFindingsProps = {
  items: Finding[];
  /** Date and sample, for example "2026-08-31 / 5 codebases, 248 files". */
  snapshot?: string;
  /** One self-contained sentence. Omit to hide the copy action. */
  citation?: string;
  title?: string;
};

export function KeyFindings({
  items,
  snapshot,
  citation,
  title = "Key findings",
}: KeyFindingsProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!citation) return;
    void navigator.clipboard?.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="border-border-strong my-[34px] border-b border-t pb-4 pt-[18px]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.18em]">
          {title}
        </span>
        <span className="text-ink-faint font-mono text-[11px]">
          {items.length} {items.length === 1 ? "finding" : "findings"}
        </span>
      </div>

      <div className="grid gap-3.5">
        {items.map((item) => (
          <div
            key={item.text}
            className="grid grid-cols-[minmax(110px,152px)_1fr] items-baseline gap-x-[18px] gap-y-1.5"
          >
            <div className="font-display text-primary text-[21px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
              {item.figure}
            </div>
            <div className="text-ink text-[15.5px] leading-[1.5]">{item.text}</div>
          </div>
        ))}
      </div>

      {snapshot || citation ? (
        <div className="border-border mt-[18px] flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t pt-3.5">
          {snapshot ? (
            <span className="text-ink-muted font-mono text-[11.5px] leading-[1.5]">{snapshot}</span>
          ) : (
            <span />
          )}
          {citation ? (
            <button
              type="button"
              onClick={copy}
              className="border-border-strong bg-surface-inset text-ink-secondary rounded-chip hover:border-primary hover:text-ink border px-3 py-[7px] font-mono text-[11.5px] transition-colors"
            >
              {copied ? "citation copied" : "copy citation"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
