import { Fragment, type ReactNode } from "react";

/**
 * `<Payoff>` is the block that answers "why am I reading this", in the first
 * screenful, as consequence rather than as data.
 *
 * It is deliberately not `KeyFindings`, which sits a screen below it: that block
 * leads with a huge figure because it is built to be lifted out and quoted, and
 * this one leads with a sentence because it is built to be understood. The
 * measurement stays inside the sentence as supporting evidence, and the action
 * line is the smallest text in the row and the only green one.
 *
 * No container, no icons, no card grid: rules between rows and nothing around
 * them, so it reads as a list of consequences in the page flow rather than as
 * an aside.
 */

export type PayoffRow = {
  /** The consequence, as a sentence. Not a section title. */
  lead: string;
  /** One or two sentences carrying the numbers that earn the lead. */
  body: string;
  /** What the reader should do. Omit where there is nothing to do. */
  action?: string;
};

export type PayoffProps = {
  rows: PayoffRow[];
};

/**
 * Measured values are set in mono, incidental counts are not: "80,477 tokens"
 * is a measurement and the "60" in "60 repositories" is not.
 *
 * ponytail: the test for "measured" is shape, not meaning. A number qualifies
 * if it carries a comma, a percent sign, a decimal point, or four or more
 * digits. That reproduces every case across the three research posts. If a post
 * ever needs a bare small number set in mono, give the row a ReactNode body
 * rather than widening this.
 */
const MEASURED = /(\d[\d,]*(?:\.\d+)?%?)/g;

function markNumbers(text: string): ReactNode[] {
  return text.split(MEASURED).map((part, i) => {
    const measured = i % 2 === 1 && (/[,%.]/.test(part) || part.length >= 4);
    return measured ? (
      <span key={i} className="text-ink font-mono text-[12.5px] tabular-nums sm:text-[13.5px]">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

export function Payoff({ rows }: PayoffProps) {
  return (
    <div className="my-9">
      {rows.map((row, i) => (
        <div
          key={row.lead}
          className={`py-[18px] first:pt-0 last:pb-0 sm:py-[22px] ${
            i < rows.length - 1 ? "border-hairline border-b" : ""
          }`}
        >
          <p className="font-display text-ink mb-2 text-[18px] font-semibold leading-[1.25] tracking-[-0.02em] sm:mb-[9px] sm:text-[21px]">
            {row.lead}
          </p>
          <p
            className={`text-ink-secondary text-[14.5px] leading-[1.55] sm:text-[15.5px] sm:leading-[1.6] ${
              row.action ? "mb-[11px] sm:mb-[13px]" : ""
            }`}
          >
            {markNumbers(row.body)}
          </p>
          {row.action ? (
            <div className="flex items-start gap-[9px] sm:items-center sm:gap-2.5">
              <span
                aria-hidden="true"
                className="bg-primary mt-[9px] h-px w-3.5 flex-none sm:mt-0 sm:w-[18px]"
              />
              <span className="text-go-fg font-mono text-[11.5px] leading-[1.5] sm:text-[12px]">
                {row.action}
              </span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
