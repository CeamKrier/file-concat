import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Bars } from "~/components/blog/bars";
import {
  CURRENT_VERSION,
  nearestOther,
  formatValue,
  isOurs,
  latestOurs,
  oursByVersion,
  ranked,
  score,
  versionAxis,
  type Benchmark,
} from "~/lib/benchmarks";
import { getPostBySlug } from "~/lib/blog";
import { cn } from "~/lib/utils";

/**
 * The chart kinds of /benchmarks, after artificialanalysis.ai: columns with
 * the value on top, a scatter of two benchmarks against each other, a step
 * line per benchmark across our versions, and a heatmap for the per-format
 * table. All of it is percentages in CSS plus one stretched SVG for lines, so
 * the server renders the final picture and nothing measures the page.
 *
 * Every value is printed next to its mark, because these get quoted.
 */

export const linkClass =
  "text-ink decoration-primary/50 hover:decoration-primary underline decoration-1 underline-offset-[4px] transition-colors duration-150 focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/** One colour per tool everywhere on the page: ours green, the two document rivals their own. */
export function toolColor(label: string, latest: string): string {
  if (label === latest) return "oklch(var(--primary))";
  if (isOurs(label)) return "oklch(var(--primary) / 0.35)";
  if (label.startsWith("Tika")) return "oklch(var(--chart-2))";
  if (label.startsWith("markitdown")) return "oklch(var(--chart-3))";
  return "#4d4539";
}

export function ChartTitle({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <>
      {title}
      <span className="text-ink-muted mt-1 block font-sans text-[13px] font-normal tracking-normal">{sub}</span>
    </>
  );
}

const titleClass = "font-display text-ink mb-4 text-[17px] font-semibold tracking-[-0.01em]";
const subOf = (b: Benchmark) => `${b.metric}, ${b.better} is better`;

/** The card every chart sits in: the chart, then version, date and the study with the method. */
export function ChartCard({
  id,
  b,
  className,
  children,
}: {
  id?: string;
  b: Benchmark;
  className?: string;
  children: ReactNode;
}) {
  const mine = latestOurs(b.rows);
  const post = getPostBySlug(b.post);
  return (
    <div
      id={id ?? b.id}
      className={cn(
        "border-hairline rounded-card flex min-w-0 scroll-mt-[80px] flex-col gap-4 border p-5",
        className,
      )}
    >
      {children}
      <p className="border-hairline text-ink-faint mt-auto border-t pt-3 font-mono text-[11.5px] leading-[1.6]">
        FileConcat {mine.version}
        {mine.version === CURRENT_VERSION ? "" : `, not rerun at ${CURRENT_VERSION}`} /{" "}
        <span className="whitespace-nowrap">{b.measured}</span>
        {post ? (
          <>
            {" / "}
            <Link to="/blog/$slug" params={{ slug: post.slug }} className={linkClass}>
              method
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Columns for a short chart, horizontal bars once the labels would not fit under a column. */
export function BenchmarkFigure({ b }: { b: Benchmark }) {
  if (b.rows.length <= 5) return <Columns b={b} />;
  return (
    <Bars
      title={<ChartTitle title={b.title} sub={subOf(b)} />}
      rows={ranked(b)}
      unit={b.unit === "percent" ? "percent" : "tokens"}
      ours={latestOurs(b.rows).label}
      wideLabels
      note={b.note}
    />
  );
}

/** Vertical columns, value on top, best first. Percent and count charts share a 0 to 100 scale. */
export function Columns({ b }: { b: Benchmark }) {
  const latest = latestOurs(b.rows).label;
  const max = b.unit === "tokens" ? Math.max(...b.rows.map((r) => r.value)) : 100;
  const height = (v: number) => `${Math.max((b.unit === "tokens" ? v / max : score(b, v) / 100) * 100, 0.8)}%`;
  return (
    <figure className="min-w-0">
      <div className={titleClass}>
        <ChartTitle title={b.title} sub={subOf(b)} />
      </div>
      <div className="flex h-[180px] items-end gap-2 sm:gap-3">
        {ranked(b).map((r) => (
          <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span
              className={cn(
                "mb-1.5 font-mono text-[12px] tabular-nums",
                r.label === latest ? "text-ink font-semibold" : "text-ink-secondary",
              )}
            >
              {b.unit === "count" ? `${r.value}/${b.of}` : b.unit === "percent" ? r.value.toFixed(1) : `${Math.round(r.value / 1000)}K`}
            </span>
            <span
              aria-hidden="true"
              className="block w-full max-w-[56px] rounded-t-[3px]"
              style={{ height: height(r.value), background: toolColor(r.label, latest) }}
            />
          </div>
        ))}
      </div>
      <div className="border-hairline flex gap-2 border-t pt-2 sm:gap-3">
        {ranked(b).map((r) => (
          <span
            key={r.label}
            className={cn(
              "min-w-0 flex-1 break-words text-center font-mono text-[11.5px] leading-[1.35]",
              r.label === latest ? "text-primary" : "text-ink-muted",
            )}
          >
            {r.label}
          </span>
        ))}
      </div>
      <p className="text-ink-muted mt-3 font-mono text-[11.5px] leading-[1.6]">
        {b.unit === "tokens" ? `${b.note} Values in thousands of tokens.` : b.note}
      </p>
    </figure>
  );
}

type Axis = { label: string; step: number; format: (v: number) => string; max?: number };
export type ScatterPoint = { label: string; x: number; y: number };

/** A domain padded to whole steps around the points, capped where the unit ends. */
function domain(values: number[], step: number, max = Infinity): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12;
  return [Math.max(0, Math.floor((lo - pad) / step) * step), Math.min(max, Math.ceil((hi + pad) / step) * step)];
}

/**
 * Two benchmarks against each other, one point per tool that ran both.
 */
export function Scatter({
  title,
  sub,
  points,
  x,
  y,
  latest,
  note,
}: {
  title: ReactNode;
  sub: ReactNode;
  points: ScatterPoint[];
  x: Axis;
  y: Axis;
  latest: string;
  note: ReactNode;
}) {
  const [x0, x1] = domain(points.map((p) => p.x), x.step, x.max);
  const [y0, y1] = domain(points.map((p) => p.y), y.step, y.max);
  const px = (v: number) => ((v - x0) / (x1 - x0)) * 100;
  const py = (v: number) => ((v - y0) / (y1 - y0)) * 100;
  const ticks = (a: number, b: number, step: number) =>
    Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

  return (
    <figure className="min-w-0">
      <div className={titleClass}>
        <ChartTitle title={title} sub={sub} />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <span className="text-ink-muted col-start-2 mb-2 font-mono text-[11.5px]">{y.label}</span>
        <div className="relative w-9 sm:w-11" aria-hidden="true">
          {ticks(y0, y1, y.step).map((t) => (
            <span
              key={t}
              className="text-ink-faint absolute right-0 translate-y-1/2 font-mono text-[11px] tabular-nums"
              style={{ bottom: `${py(t)}%` }}
            >
              {y.format(t)}
            </span>
          ))}
        </div>
        <div className="border-hairline relative aspect-square border-b border-l sm:aspect-[16/8]">
          {ticks(y0, y1, y.step).map((t) => (
            <span key={t} className="bg-hairline absolute inset-x-0 h-px" style={{ bottom: `${py(t)}%` }} />
          ))}
          {points.map((p) => (
            <PointMark key={p.label} p={p} points={points} px={px} py={py} latest={latest} format={[x.format, y.format]} />
          ))}
        </div>
        <div className="relative col-start-2 h-6" aria-hidden="true">
          {ticks(x0, x1, x.step).map((t, i) => (
            <span
              key={t}
              // Every other tick on a phone, where six labels would touch.
              className={cn(
                "text-ink-faint absolute top-1.5 -translate-x-1/2 font-mono text-[11px] tabular-nums",
                i % 2 && "hidden sm:block",
              )}
              style={{ left: `${px(t)}%` }}
            >
              {x.format(t)}
            </span>
          ))}
        </div>
        <span className="text-ink-muted col-start-2 mt-1 text-right font-mono text-[11.5px]">{x.label}</span>
      </div>
      <p className="text-ink-muted mt-3 font-mono text-[11.5px] leading-[1.6]">
        {note}
      </p>
    </figure>
  );
}

function PointMark({
  p,
  points,
  px,
  py,
  latest,
  format,
}: {
  p: ScatterPoint;
  points: ScatterPoint[];
  px: (v: number) => number;
  py: (v: number) => number;
  latest: string;
  format: [(v: number) => string, (v: number) => string];
}) {
  const left = px(p.x);
  const bottom = py(p.y);
  // A close neighbour pushes the two labels apart vertically, the higher one up.
  const near = points.find(
    (q) => q !== p && Math.abs(px(q.x) - left) < 22 && Math.abs(py(q.y) - bottom) < 14,
  );
  const vertical = near ? (py(near.y) < bottom ? "up" : "down") : null;
  const align = left > 70 ? "right" : left < 25 ? "left" : "center";
  const ours = p.label === latest;
  const labelStyle: CSSProperties = vertical
    ? {
        [vertical === "up" ? "bottom" : "top"]: 12,
        ...(align === "right" ? { right: -6 } : align === "left" ? { left: -6 } : { left: "50%", transform: "translateX(-50%)" }),
      }
    : left > 70
      ? { right: 14, top: "50%", transform: "translateY(-50%)" }
      : { left: 14, top: "50%", transform: "translateY(-50%)" };

  return (
    <span className="absolute h-0 w-0" style={{ left: `${left}%`, bottom: `${bottom}%` }}>
      <span
        className={cn("absolute -translate-x-1/2 translate-y-1/2 rounded-full", ours ? "h-3.5 w-3.5" : "h-3 w-3")}
        style={{ background: toolColor(p.label, latest), left: 0, bottom: 0 }}
        title={`${p.label}: ${format[0](p.x)}, ${format[1](p.y)}`}
      />
      <span
        className={cn(
          "absolute whitespace-nowrap font-mono text-[11.5px] leading-none",
          ours ? "text-ink font-semibold" : "text-ink-secondary",
        )}
        style={labelStyle}
      >
        {p.label}
      </span>
    </span>
  );
}

/**
 * One benchmark across our versions: a step for each rerun, held as a dashed
 * line through the releases it was not rerun at, and the best other tool as
 * a flat reference.
 */
export function VersionSteps({ b }: { b: Benchmark }) {
  const axis = versionAxis();
  const mine = oursByVersion(b.rows);
  const latest = mine.at(-1)!;
  const other = nearestOther(b);
  const first = mine[0];
  const xAt = (version: string) => (axis.indexOf(version) / (axis.length - 1)) * 100;
  const yAt = (value: number) => 100 - score(b, value);

  let solid = "";
  mine.forEach((r, i) => {
    solid += `${i ? "L" : "M"}${xAt(r.version)},${yAt(r.value)} `;
    const next = mine[i + 1];
    if (next) solid += `L${xAt(next.version)},${yAt(r.value)} `;
  });
  // Our latest value as a level across the whole axis, under the steps.
  const level = `M0,${yAt(latest.value)} L100,${yAt(latest.value)}`;
  const delta = mine.length > 1 ? score(b, latest.value) - score(b, first.value) : null;

  return (
    <a
      href={`#${b.id}`}
      className="border-hairline hover:border-ink-faint rounded-card group flex min-w-0 flex-col border p-4 transition-colors duration-150"
    >
      <span className="text-ink-secondary text-[13.5px]">{b.headline}</span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-ink text-[26px] font-semibold tabular-nums tracking-[-0.03em]">
          {b.unit === "count" ? `${latest.value}/${b.of}` : formatValue(b, latest.value)}
        </span>
        <span className="text-ink-faint font-mono text-[11.5px]">at {latest.version}</span>
      </span>
      <span className="text-go-fg font-mono text-[12px]">
        {delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts since ${first.version}` : `measured once, at ${first.version}`}
      </span>
      <span className="relative mt-4 block h-[88px]" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {[0, 50, 100].map((g) => (
            <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="oklch(var(--hairline))" vectorEffect="non-scaling-stroke" />
          ))}
          {other ? (
            <line
              x1="0"
              x2="100"
              y1={yAt(other.value)}
              y2={yAt(other.value)}
              stroke="oklch(var(--chart-3))"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={level}
            fill="none"
            stroke="oklch(var(--primary))"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path d={solid} fill="none" stroke="oklch(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {mine.map((r) => (
          <span
            key={r.label}
            className="bg-primary absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${xAt(r.version)}%`, top: `${yAt(r.value)}%` }}
          />
        ))}
      </span>
      <span className="text-ink-faint mt-2 flex justify-between font-mono text-[10.5px]" aria-hidden="true">
        <span>{axis[0]}</span>
        <span>{axis.at(-1)}</span>
      </span>
      {other ? (
        <span className="text-ink-muted mt-2 flex items-center gap-1.5 font-mono text-[11px] leading-[1.4]" aria-hidden="true">
          <span className="h-[2px] w-4 shrink-0" style={{ background: "oklch(var(--chart-3))" }} />
          {other.label.replace(/,.*$/, "")} {formatValue(b, other.value)}
        </span>
      ) : null}
      <span className="sr-only">
        {mine.map((r) => `FileConcat ${r.version}: ${formatValue(b, r.value)}`).join(", ")}
        {other ? `. Closest other tool, ${other.label}: ${formatValue(b, other.value)}.` : "."}
      </span>
    </a>
  );
}

/**
 * The per-format charts as one table: a row per format, a column per tool,
 * each cell tinted by its value and the row's best outlined. A row whose
 * format has a converter page links to it.
 */
export function FormatHeatmap({ charts }: { charts: Benchmark[] }) {
  const tools = ranked(charts[0]).map((r) => r.label);
  const columns = [
    ...tools.filter((t) => t === latestOurs(charts[0].rows).label),
    ...tools.filter((t) => !isOurs(t)),
    ...tools.filter((t) => isOurs(t) && t !== latestOurs(charts[0].rows).label),
  ];
  const latest = columns[0];
  const extra = (note: string) => note.replace(/^\d+ real files\.\s*/, "");
  const files = (note: string) => /^(\d+) real files/.exec(note)?.[1];

  return (
    <div className="min-w-0">
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr>
            <th className="text-ink-muted w-[34%] pb-2 text-[12px] font-normal sm:w-[30%]">Format</th>
            {columns.map((c) => {
              const [name, version] = [c.slice(0, c.lastIndexOf(" ")), c.slice(c.lastIndexOf(" ") + 1)];
              return (
                <th
                  key={c}
                  className={cn(
                    "pb-2 text-center font-mono text-[11.5px] font-normal leading-[1.3]",
                    c === latest ? "text-primary" : "text-ink-muted",
                  )}
                >
                  {/* A break point inside long names, so "FileConcat" wraps on a phone instead of overlapping. */}
                  {name.length > 8 ? (
                    <>
                      {name.slice(0, 4)}
                      <wbr />
                      {name.slice(4)}
                    </>
                  ) : (
                    name
                  )}
                  <span className="block">{version}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {charts.map((b) => {
            const best = ranked(b)[0].value;
            return (
              <tr key={b.id} id={b.id} className="border-hairline scroll-mt-[80px] border-t">
                <th scope="row" className="py-2 pr-2 align-middle font-normal">
                  <span className="text-ink block text-[13.5px] leading-[1.3]">{b.title}</span>
                  <span className="text-ink-faint font-mono text-[11px]">
                    {files(b.note)} files
                    {b.convert ? (
                      <>
                        {" / "}
                        <a href={`/convert/${b.convert}`} className={linkClass}>
                          convert
                        </a>
                      </>
                    ) : null}
                  </span>
                </th>
                {columns.map((c) => {
                  const v = b.rows.find((r) => r.label === c)?.value;
                  return (
                    <td key={c} className="p-[3px]">
                      <span
                        className={cn(
                          "flex h-10 items-center justify-center rounded-[4px] font-mono text-[12.5px] tabular-nums",
                          v === best ? "ring-primary text-ink font-semibold ring-1" : "text-ink-secondary",
                        )}
                        style={{ background: v === undefined ? undefined : `oklch(var(--primary) / ${((v / 100) ** 2 * 0.42).toFixed(3)})` }}
                      >
                        {v === undefined ? "-" : v.toFixed(1)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="text-ink-muted mt-4 grid gap-1 font-mono text-[11.5px] leading-[1.6]">
        <li>Weighted coverage, higher is better. Outlined: best in the row.</li>
        {charts
          .filter((b) => extra(b.note))
          .map((b) => (
            <li key={b.id}>
              {b.title}: {extra(b.note)}
            </li>
          ))}
      </ul>
    </div>
  );
}
