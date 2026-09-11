import { scaleLog } from "@visx/scale";

import bundleSizes from "~/data/repo-funnel-values.json";
import { cn } from "~/lib/utils";

/**
 * The "will it fit" picture for the homepage: one bar per measured repository,
 * smallest to largest, on a log axis, with the three window sizes drawn across
 * as dashed lines. A bar under a line fits that window, so each count is read
 * off the chart rather than printed beside it.
 *
 * Same data as the research post's fit curve (`~/data/repo-funnel-values.json`,
 * 60 public repositories, measured 2026-09-11), turned upright because the
 * homepage band is wide and short where the article's column is narrow and
 * tall. Every count below is derived from the values, never typed in.
 *
 * Heights are percentages from a real log scale over a fixed decade domain, so
 * the smallest repository still shows and the largest leaves headroom. No
 * measurement step: the whole thing renders complete on the server.
 */

const WINDOWS = [
  { label: "128K", value: 128_000 },
  { label: "200K", value: 200_000 },
  { label: "1M", value: 1_000_000 },
];

const DOMAIN: [number, number] = [5_000, 10_000_000];

const num = (v: number) => v.toLocaleString("en-US");

export function FitBars({ className }: { className?: string }) {
  const values = [...bundleSizes].sort((a, b) => a - b);
  const scale = scaleLog<number>({ domain: DOMAIN, range: [0, 100] });
  const at = (v: number) => scale(v);
  const largestWindow = WINDOWS[WINDOWS.length - 1].value;

  const lines = WINDOWS.map((w) => ({
    ...w,
    y: at(w.value),
    fits: values.filter((v) => v <= w.value).length,
  }));
  const pct = (fits: number) => `${Math.round((fits / values.length) * 100)}%`;

  return (
    <figure className={cn("min-w-0", className)}>
      {/* On a phone the plot is too narrow to carry its labels, so the counts
          move above it and the lines stay where they are. */}
      <ul className="mb-4 grid gap-1 font-mono text-[11.5px] sm:hidden">
        {lines.map((l) => (
          <li key={l.label} className="text-ink">
            <span className="text-primary tabular-nums">
              {l.fits} of {values.length}
            </span>{" "}
            fit {l.label}
            <span className="text-ink-muted"> ({pct(l.fits)})</span>
          </li>
        ))}
      </ul>

      <div className="border-border-strong relative h-[240px] border-b">
        <div className="absolute inset-0 flex items-end gap-px sm:gap-0.5" aria-hidden="true">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className={cn(
                "min-w-0 flex-1 rounded-t-[2px]",
                v <= largestWindow ? "bg-primary" : "bg-[#3a3329]",
              )}
              style={{ height: `${at(v)}%` }}
            />
          ))}
        </div>

        {lines.map((l, i) => (
          <div key={l.label}>
            <div
              aria-hidden="true"
              className="absolute left-0 right-0 h-px [background:repeating-linear-gradient(to_right,oklch(var(--text-muted))_0_4px,transparent_4px_8px)]"
              style={{ bottom: `${l.y}%` }}
            />
            {/* The lowest label hangs under its line and the others sit on top
                of theirs, because 128K and 200K are closer together than a
                label is tall. Each label knocks out the bars behind it. */}
            <div
              className={cn(
                "bg-background text-ink absolute left-0 hidden whitespace-nowrap px-1 font-mono text-[11.5px] leading-[1.4] sm:block",
                i === 0 ? "translate-y-[calc(100%+4px)]" : "-translate-y-1",
              )}
              style={{ bottom: `${l.y}%` }}
            >
              <span className="text-primary tabular-nums">
                {l.fits} of {values.length}
              </span>{" "}
              fit {l.label}
              <span className="text-ink-muted"> ({pct(l.fits)})</span>
            </div>
          </div>
        ))}
      </div>

      <div className="text-ink-faint flex justify-between pt-1.5 font-mono text-[11px] tabular-nums">
        <span>{num(values[0])} tokens</span>
        <span>{num(values[values.length - 1])} tokens</span>
      </div>

      <figcaption className="text-ink-muted mt-3 font-mono text-[11.5px] leading-[1.6]">
        {values.length} public repositories as one file each, median {num(median(values))} tokens
      </figcaption>
    </figure>
  );
}

function median(sorted: number[]) {
  const mid = sorted.length / 2;
  return sorted.length % 2 === 1
    ? sorted[Math.floor(mid)]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
