import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERT_FORMATS } from "~/components/convert/convert-formats";
import {
  BENCHMARKS,
  CURRENT_VERSION,
  bestOther,
  latestOurs,
  nearestOther,
  oursByVersion,
  ranked,
  score,
  shownRows,
  versionAxis,
  type Benchmark,
} from "~/lib/benchmarks";

/**
 * The benchmarks page is only as honest as its data file: every chart names
 * the FileConcat version it measured and links the study with its method.
 */

const posts = new Set(
  readdirSync(join(__dirname, "..", "src", "content", "blog")).map((f) => f.replace(/\.mdx$/, "")),
);

// The two document studies run in a couple of minutes with no network, so
// every release reruns them (packages/cli/scripts/bench/rerun-documents.sh).
// The others rerun only when a release changes their reader.
const EVERY_RELEASE = ["markitdown-vs-tika-text-extraction", "what-gets-lost-converting-documents-to-text"];

describe("benchmarks.json", () => {
  it.each(BENCHMARKS.filter((b) => EVERY_RELEASE.includes(b.post)).map((b) => [b.id, b] as const))(
    "%s was rerun at the version the site ships",
    (_, b) => {
      expect(latestOurs(b.rows).version).toBe(CURRENT_VERSION);
    },
  );

  it.each(BENCHMARKS.map((b) => [b.id, b] as const))("%s names our version and its study", (_, b) => {
    expect(latestOurs(b.rows).version).toMatch(/^\d+\.\d+$/);
    expect(posts.has(b.post)).toBe(true);
    expect(b.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (b.unit === "count") expect(b.of).toBeGreaterThanOrEqual(Math.max(...b.rows.map((r) => r.value)));
  });

  it("links only to converter pages that exist", () => {
    const slugs = new Set(CONVERT_FORMATS.map((f) => f.slug));
    for (const b of BENCHMARKS.filter((x) => x.convert)) expect(slugs.has(b.convert!)).toBe(true);
  });

  it("puts every version on the by-version axis, ending at the one that ships", () => {
    const axis = versionAxis();
    expect(axis.at(-1)).toBe(CURRENT_VERSION);
    for (const b of BENCHMARKS) for (const r of oursByVersion(b.rows)) expect(axis).toContain(r.version);
  });

  it("has unique ids, which are the page's anchors", () => {
    expect(new Set(BENCHMARKS.map((b) => b.id)).size).toBe(BENCHMARKS.length);
  });
});

const chart = (better: Benchmark["better"]): Benchmark => ({
  id: "x",
  title: "x",
  metric: "x",
  unit: "tokens",
  better,
  measured: "2026-10-17",
  post: "x",
  note: "x",
  rows: [
    { label: "FileConcat 2.10", value: 5 },
    { label: "FileConcat 2.9", value: 9 },
    { label: "Tool A 1.0", value: 3 },
    { label: "Tool B 2.0", value: 7 },
  ],
});

describe("chart helpers", () => {
  it("takes the highest version as ours, numerically, not as text", () => {
    expect(latestOurs(chart("higher").rows)).toMatchObject({ label: "FileConcat 2.10", version: "2.10" });
  });

  it("orders our rows oldest first and scales a count to 100", () => {
    expect(oursByVersion(chart("higher").rows).map((r) => r.version)).toEqual(["2.9", "2.10"]);
    expect(score({ ...chart("higher"), unit: "count", of: 26 }, 13)).toBe(50);
  });

  it("draws a repeated value once, at the newest version that holds it", () => {
    const rows = [
      { label: "FileConcat 2.8", value: 90 },
      { label: "FileConcat 2.7", value: 90 },
      { label: "FileConcat 2.6", value: 90 },
      { label: "FileConcat 2.3", value: 79 },
      { label: "FileConcat 2.0", value: 90 },
      { label: "Tool A 1.0", value: 90 },
    ];
    expect(shownRows(rows).map((r) => r.label)).toEqual(["FileConcat 2.8", "FileConcat 2.3", "FileConcat 2.0", "Tool A 1.0"]);
  });

  it("picks the best other tool in the chart's own direction", () => {
    expect(bestOther(chart("higher"))?.label).toBe("Tool B 2.0");
    expect(bestOther(chart("lower"))?.label).toBe("Tool A 1.0");
    expect(ranked(chart("lower"))[0].label).toBe("Tool A 1.0");
    // ours is 5 (FileConcat 2.10); Tool C at 5.5 sits closer than A at 3 or B at 7.
    expect(nearestOther({ ...chart("higher"), rows: [...chart("higher").rows, { label: "Tool C", value: 5.5 }] })?.label).toBe("Tool C");
  });
});
