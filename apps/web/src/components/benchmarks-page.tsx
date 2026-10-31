import {
  BenchmarkFigure,
  ChartCard,
  FormatHeatmap,
  Scatter,
  VersionSteps,
  linkClass,
  type ScatterPoint,
} from "~/components/benchmark-charts";
import { BlogShell } from "~/components/blog/blog-shell";
import {
  BENCHMARKS,
  CURRENT_VERSION,
  LAST_MEASURED,
  NOT_RERUN,
  SECTIONS,
  benchmark,
  isCurrent,
  latestOurs,
  score,
  shownRows,
  type Benchmark,
} from "~/lib/benchmarks";
import { formatPostDate } from "~/lib/blog";

const h2Class =
  "font-display text-ink scroll-mt-[80px] text-[clamp(1.375rem,2.25vw,1.75rem)] font-semibold leading-[1.15] tracking-[-0.03em]";

const pct = (v: number) => `${Math.round(v)}%`;

/**
 * One point per tool that ran both benchmarks, matched by its label. One of
 * our versions is left out when it repeated the next version on both axes.
 */
function pair(x: Benchmark, y: Benchmark): ScatterPoint[] {
  const kept = new Set([...shownRows(x.rows), ...shownRows(y.rows)].map((r) => r.label));
  return x.rows.filter((r) => kept.has(r.label)).flatMap((r) => {
    const other = y.rows.find((o) => o.label === r.label);
    return other ? [{ label: r.label, x: score(x, r.value), y: score(y, other.value) }] : [];
  });
}

/**
 * /benchmarks: every measurement of FileConcat against other tools, at the
 * version it was last run on. Read the way artificialanalysis.ai reads: a
 * scatter and a by-version strip up top, then grids of charts with one line each, and the method one link
 * away in the study that first published it. The chart kinds live in
 * `benchmark-charts.tsx`.
 *
 * The studies keep the numbers they were published with. This page carries
 * the latest run. A chart not rerun at the current version leaves its section
 * for "Not rerun at X.Y" at the end, so no figure mixes two versions (the
 * Zyte leaderboard's "did not re-run" table).
 */
export function BenchmarksPage() {
  const coverage = benchmark("document-coverage");
  const hard = benchmark("hard-files");
  const sections = SECTIONS.map((s) => ({ ...s, charts: s.charts.filter(isCurrent) })).filter(
    (s) => s.charts.length,
  );
  const stale = "not-rerun";

  return (
    <BlogShell wide>
      <header className="max-w-[640px]">
        <h1
          className="font-display text-ink text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.035em]"
          style={{ textWrap: "balance" }}
        >
          FileConcat benchmarks
        </h1>
        <p className="text-ink-secondary mt-4 text-[16px] leading-[1.55]">
          FileConcat against other tools on every benchmark we have run. Each row names the version
          it measured.
        </p>
        <p className="text-ink-faint mt-3 font-mono text-[12.5px]">
          Updated <time dateTime={LAST_MEASURED}>{formatPostDate(LAST_MEASURED)}</time> / current
          version FileConcat {CURRENT_VERSION}
        </p>
      </header>

      <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={linkClass}>
            {s.title}
          </a>
        ))}
        {NOT_RERUN.length ? (
          <a href={`#${stale}`} className={linkClass}>
            Not rerun at {CURRENT_VERSION}
          </a>
        ) : null}
      </nav>

      <div className="mt-8 grid gap-4">
        <ChartCard id="overview" b={coverage}>
          <Scatter
            title="Reads more of a document, and fails on fewer files"
            sub="Every tool that ran both document benchmarks"
            points={pair(coverage, hard)}
            x={{ label: `${coverage.headline}`, step: 10, max: 100, format: pct }}
            y={{ label: `${hard.headline} handled, of ${hard.of}`, step: 10, max: 100, format: pct }}
            latest={latestOurs(coverage.rows).label}
            note={`Coverage: ${coverage.metric.toLowerCase()}. Hard files: ${hard.note}`}
          />
        </ChartCard>
        <div>
          <h2 className="font-display text-ink mt-6 text-[17px] font-semibold tracking-[-0.01em]">
            FileConcat by version
          </h2>
          <p className="text-ink-muted mt-1 text-[13px]">
            Green: FileConcat by release, the dashed line its latest score. Amber: the other tool closest to it.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BENCHMARKS.filter((b) => b.headline && isCurrent(b)).map((b) => (
              <VersionSteps key={b.id} b={b} />
            ))}
          </div>
        </div>
      </div>

      {sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id} className="mt-16">
          <h2 id={s.id} className={h2Class}>
            {s.title}
          </h2>
          <p className="text-ink-secondary mt-2 text-[15px] leading-[1.55]">{s.intro}</p>
          <SectionCharts id={s.id} charts={s.charts} />
        </section>
      ))}

      {NOT_RERUN.length ? (
        <section aria-labelledby={stale} className="mt-16">
          <h2 id={stale} className={h2Class}>
            Not rerun at {CURRENT_VERSION}
          </h2>
          <p className="text-ink-secondary mt-2 max-w-[640px] text-[15px] leading-[1.55]">
            No release since the version each chart names changed the reader it tests, so these
            did not run again. Their FileConcat row is from that older version.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {NOT_RERUN.map((b) => (
              <ChartCard key={b.id} b={b}>
                <BenchmarkFigure b={b} />
              </ChartCard>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="how-this-page-is-kept" className="mt-16 max-w-[640px]">
        <h2 id="how-this-page-is-kept" className={h2Class}>
          How this page is kept
        </h2>
        <p className="text-ink-secondary mt-3 text-[15px] leading-[1.65]">
          Every release runs the document benchmarks again. The PDF, web page, archive and
          repository benchmarks run again when a release changes the reader they test. Each new
          FileConcat row joins the older ones, so every chart is also its own history. A new method
          starts a new chart. When another tool&apos;s newer release is measured, its row is
          replaced and names the new version. The linked studies keep the numbers and versions they were published
          with.
        </p>
        <p className="text-ink-secondary mt-3 text-[15px] leading-[1.65]">
          Your files are not uploaded to us, the whole thing runs in your browser.
        </p>
      </section>
    </BlogShell>
  );
}

function SectionCharts({ id, charts }: { id: string; charts: Benchmark[] }) {
  if (id === "formats")
    return (
      <ChartCard id="formats-table" b={charts[0]} className="mt-6">
        <FormatHeatmap charts={charts} />
      </ChartCard>
    );

  const density = charts.find((b) => b.id === "repository-density");
  const size = charts.find((b) => b.id === "repository-size");
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {density && size ? (
        <ChartCard b={density} className="md:col-span-2">
          <span id={size.id} className="scroll-mt-[80px]" />
          <Scatter
            title="More of your own code, in a smaller bundle"
            sub="Median of 60 repositories, each tool at its defaults"
            points={pair(size, density)}
            x={{ label: `${size.metric}, lower is better`, step: 50000, format: (v) => `${v / 1000}K` }}
            y={{ label: `${density.title}, higher is better`, step: 10, max: 100, format: pct }}
            latest={latestOurs(density.rows).label}
            note={`${density.note} ${size.note}`}
          />
        </ChartCard>
      ) : null}
      {charts
        .filter((b) => b !== density && b !== size)
        .map((b) => (
          <ChartCard key={b.id} b={b}>
            <BenchmarkFigure b={b} />
          </ChartCard>
        ))}
    </div>
  );
}
