import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/**
 * `<Bars>` is one value per tool as a horizontal bar, the way the comparison
 * study's cost and signal-density medians are read: four rows, the longest
 * bar full width, our own row in the primary colour. It started as the
 * homepage's cost figure and moved here so the post and the homepage draw the
 * same picture from the same numbers.
 *
 * Every value is in the markup next to its bar, because these get quoted.
 */

export type BarsProps = {
  title: string;
  rows: { label: string; value: number }[];
  /** "tokens" renders 235,672; "percent" renders 66.7%. */
  unit?: "tokens" | "percent";
  /** A dotted line at the smallest value, for a "how far from the cheapest" read. */
  markMin?: boolean;
  /** The caption under the bars, one line. */
  children?: ReactNode;
  /** The mono line under the caption: what the figure is, in its own terms. */
  note?: ReactNode;
  className?: string;
};

const OURS = "FileConcat";

const format = (value: number, unit: BarsProps["unit"]) =>
  unit === "percent" ? `${value.toFixed(1)}%` : value.toLocaleString("en-US");

export function Bars({ title, rows, unit = "tokens", markMin, children, note, className }: BarsProps) {
  const max = Math.max(...rows.map((r) => r.value));
  const min = Math.min(...rows.map((r) => r.value));
  const pct = (v: number) => `${((v / max) * 100).toFixed(2)}%`;

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="font-display text-ink mb-4 text-[17px] font-semibold tracking-[-0.01em]">
        {title}
      </div>
      <div className="grid gap-2.5">
        {rows.map((r) => {
          const ours = r.label === OURS;
          return (
            <div
              key={r.label}
              className="grid grid-cols-[minmax(72px,112px)_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className={cn("font-mono text-[13px]", ours ? "text-primary" : "text-ink-secondary")}>
                {r.label}
              </span>
              <span className="relative block h-[22px]" aria-hidden="true">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-[3px]",
                    ours ? "bg-primary" : "bg-[#3a3329]",
                  )}
                  style={{ width: pct(r.value) }}
                />
                {markMin ? (
                  <span
                    className="absolute -bottom-[5px] -top-[5px] w-px [background:repeating-linear-gradient(to_bottom,oklch(var(--text-muted))_0_4px,transparent_4px_8px)]"
                    style={{ left: pct(min) }}
                  />
                ) : null}
              </span>
              <span className="text-ink text-right font-mono text-[13px] tabular-nums">
                {format(r.value, unit)}
              </span>
            </div>
          );
        })}
      </div>
      {children ? (
        <figcaption className="text-ink-secondary mt-4 max-w-[52ch] text-pretty text-[14px] leading-[1.55]">
          {children}
        </figcaption>
      ) : null}
      {note ? (
        <p className="text-ink-muted mt-2 font-mono text-[11.5px] leading-[1.6]">{note}</p>
      ) : null}
    </figure>
  );
}
