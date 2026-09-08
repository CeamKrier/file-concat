/**
 * `<Stopper>` is the block that makes a fast scroller stop: one measured value
 * set large, one line of what it means, one mono source line. Nothing else.
 *
 * It is the same block every time and it appears three or four times in a post,
 * which is the point. By the second one the reader recognises the shape and
 * slows down before reading it, which is not something a one-off figure can do.
 *
 * No panel and no border, only rules above and below, so it never reads as a
 * figure or as a stat card. It steps out to the figure width because that step
 * is half of what makes it visible.
 */

export type StopperProps = {
  /** The measured value. A figure or a short phrase, never a sentence. */
  value: string;
  /** What it means, in one sentence. */
  children: React.ReactNode;
  /** Population and date, or where the number is derived. Mono, faint. */
  source?: string;
  /**
   * Amber marks the one value in a post the reader should not skip past. At
   * most one per post: a second one spends the signal. Never red.
   */
  tone?: "default" | "warn";
};

/**
 * A value made only of digits, separators and a unit is a figure and can take
 * the larger size. "3 of 16 still open" is a phrase and wraps, so it starts
 * smaller to keep the block to two lines at 358px.
 */
const isFigure = (value: string) => /^[$\d.,%xkKmMbB\s]+$/.test(value);

export function Stopper({ value, children, source, tone = "default" }: StopperProps) {
  const figure = isFigure(value);

  return (
    <figure className="fc-breakout border-border-strong my-10 border-y py-7 sm:py-8">
      <div className="fc-measure">
        <p
          className={`font-display font-bold leading-[1.02] tracking-[-0.04em] tabular-nums ${
            figure ? "text-[50px] sm:text-[76px]" : "text-[38px] sm:text-[60px]"
          } ${tone === "warn" ? "text-info" : "text-ink"}`}
        >
          {value}
        </p>
        <figcaption className="text-ink-secondary mt-3 max-w-[46ch] text-[16px] leading-[1.5] sm:text-[17px]">
          {children}
        </figcaption>
        {source ? (
          <p className="text-ink-faint mt-3 font-mono text-[11px] leading-[1.5]">{source}</p>
        ) : null}
      </div>
    </figure>
  );
}
