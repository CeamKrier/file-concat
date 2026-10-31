import data from "~/data/benchmarks.json";

import { version } from "../../package.json";

/**
 * The benchmarks page reads one file, `src/data/benchmarks.json`. A rerun adds
 * a row labelled with the version it measured and moves `measured`; it never
 * edits an older FileConcat row, so each chart is also its own history. Another
 * tool's row is replaced when that tool ships a newer release: the chart then
 * compares against what people can install today. A change of method gets a
 * new benchmark id rather than joining the old series.
 */

export type BenchmarkRow = { label: string; value: number };

export type Benchmark = {
  id: string;
  /** Set on the charts the "by version" overview draws, as the card's name there. */
  headline?: string;
  title: string;
  /** What the value is, one line under the title. */
  metric: string;
  unit: "percent" | "count" | "tokens";
  of?: number;
  better: "higher" | "lower";
  measured: string;
  post: string;
  note: string;
  /** The /convert/<slug> page that shows this chart beside its converter. */
  convert?: string;
  rows: BenchmarkRow[];
};

export type BenchmarkSection = { id: string; title: string; intro: string; charts: Benchmark[] };

export const SECTIONS = data.sections as BenchmarkSection[];

export const BENCHMARKS = SECTIONS.flatMap((s) => s.charts);

/** "2.6", the version the site ships. */
export const CURRENT_VERSION = version.split(".").slice(0, 2).join(".");

const OURS = /^FileConcat (\d+)\.(\d+)$/;

const ours = (row: BenchmarkRow) => OURS.exec(row.label);

export const isOurs = (label: string) => OURS.test(label);

/** Our rows, oldest version first, compared as numbers so 2.10 follows 2.9. */
export function oursByVersion(rows: BenchmarkRow[]): (BenchmarkRow & { version: string })[] {
  return rows
    .map((row) => ({ row, m: ours(row) }))
    .filter((x): x is { row: BenchmarkRow; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]) || Number(a.m[2]) - Number(b.m[2]))
    .map(({ row, m }) => ({ ...row, version: `${m[1]}.${m[2]}` }));
}

/** The FileConcat row with the highest version: the one the table was last run on. */
export function latestOurs(rows: BenchmarkRow[]): BenchmarkRow & { version: string } {
  const latest = oursByVersion(rows).at(-1);
  if (!latest) throw new Error("a benchmark without a FileConcat row");
  return latest;
}

/** Whether the chart's newest FileConcat row is the version the site ships. */
export const isCurrent = (b: Benchmark) => latestOurs(b.rows).version === CURRENT_VERSION;

/**
 * The charts not run again at the shipping version. They keep their older
 * row and sit apart on the page, never mixed with the current ones.
 */
export const NOT_RERUN = BENCHMARKS.filter((b) => !isCurrent(b));

/** The best row that is not FileConcat, or null when the chart only tracks our own versions. */
export function bestOther(b: Benchmark): BenchmarkRow | null {
  const sign = b.better === "higher" ? -1 : 1;
  return b.rows.filter((r) => !isOurs(r.label)).sort((x, y) => sign * (x.value - y.value))[0] ?? null;
}

/** The other tool whose value sits closest to our latest one, either side of it. */
export function nearestOther(b: Benchmark): BenchmarkRow | null {
  const mine = latestOurs(b.rows).value;
  return b.rows.filter((r) => !isOurs(r.label)).sort((x, y) => Math.abs(x.value - mine) - Math.abs(y.value - mine))[0] ?? null;
}

/**
 * The rows a chart draws: a FileConcat row whose value the next version
 * repeated is dropped, so a rerun that moved nothing shows as the newest
 * version alone instead of a column per release with the same number. The
 * data keeps every row; the by-version strip still reads them all.
 */
export function shownRows(rows: BenchmarkRow[]): BenchmarkRow[] {
  const mine = oursByVersion(rows);
  const repeated = new Set(mine.filter((r, i) => mine[i + 1]?.value === r.value).map((r) => r.label));
  return rows.filter((r) => !repeated.has(r.label));
}

/** Best first, the way a leaderboard reads. */
export const ranked = (b: Benchmark) =>
  shownRows(b.rows).sort((x, y) => (b.better === "higher" ? y.value - x.value : x.value - y.value));

export function formatValue(b: Benchmark, value: number): string {
  if (b.unit === "percent") return `${value.toFixed(1)}%`;
  if (b.unit === "count") return `${value} of ${b.of}`;
  return value.toLocaleString("en-US");
}

/** The newest `measured` date on the page, which is the date it shows as updated. */
export const LAST_MEASURED = BENCHMARKS.map((b) => b.measured).sort().at(-1)!;

/** The benchmarks whose numbers a post first published, for the post's own header. */
export const benchmarksFromPost = (slug: string) => BENCHMARKS.filter((b) => b.post === slug);

export function benchmark(id: string): Benchmark {
  const b = BENCHMARKS.find((x) => x.id === id);
  if (!b) throw new Error(`no benchmark "${id}" in benchmarks.json`);
  return b;
}

/** A value on a 0 to 100 scale, so a count and a percentage share an axis. */
export const score = (b: Benchmark, value: number) => (b.unit === "count" ? (value / b.of!) * 100 : value);

/**
 * Every minor version from the oldest FileConcat row on the page to the one
 * that ships, so the "by version" charts share one x axis and a release with
 * no rerun still has its place on it.
 */
export function versionAxis(): string[] {
  const [major, from] = BENCHMARKS.flatMap((b) => oursByVersion(b.rows))
    .map((r) => r.version.split(".").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
  const [curMajor, to] = CURRENT_VERSION.split(".").map(Number);
  // ponytail: one major only; a 3.0 needs the axis to list releases instead.
  if (curMajor !== major) throw new Error("versionAxis spans one major version");
  return Array.from({ length: to - from + 1 }, (_, i) => `${major}.${from + i}`);
}

/** The charts a /convert page shows, by its slug. */
export const benchmarksForConvert = (slug: string) => BENCHMARKS.filter((b) => b.convert === slug);
