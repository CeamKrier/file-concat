import { beforeAll, describe, expect, it } from "vitest";
import { encoding_for_model } from "@dqbd/tiktoken";
import {
  assembleOutput,
  generateFileTree,
  generateProjectName,
  type OutputStyle,
} from "@fileconcat/core";

import { estimateTokenCount } from "~/lib/tokens-client";
import {
  LARGE_BUNDLE_CHARS,
  estimateBundleTokens,
  estimateTokenCount as shimEstimate,
  preloadTokenEstimator,
} from "~/lib/tokens";

/**
 * The estimator above LARGE_BUNDLE_CHARS used to be characters / 4, which is an
 * English-prose ratio applied to whatever the bundle happened to be. These
 * tests pin the thing that replaced it: an estimate extrapolated from slices
 * that were actually tokenized, scored against the true count of the same text.
 *
 * The CJK case is the one that matters. It is where the old rule was not
 * slightly off but wrong by a factor, and no test of English source would have
 * caught it.
 */

function exact(text: string): number {
  const enc = encoding_for_model("o1-preview-2024-09-12");
  const count = enc.encode(text).length;
  enc.free();
  return count;
}

/** Grow `unit` past the threshold, varying it so slices are not identical. */
function oversize(unit: string): string {
  const parts: string[] = [];
  let length = 0;
  for (let i = 0; length <= LARGE_BUNDLE_CHARS; i++) {
    const part = `${unit}\n// section ${i}\n`;
    parts.push(part);
    length += part.length;
  }
  return parts.join("");
}

const SOURCE = `export function handleRequest(req: Request, res: Response) {
  const { id, name } = req.body;
  if (!id) return res.status(400).json({ error: "id is required" });
  return res.json({ id, name, updatedAt: Date.now() });
}
`;

const PROSE_CJK = `这是一段中文文本，用来测试分词器对中文的处理方式。
中文的字符与词元的比例和英文完全不同，所以按字符除以四来估算是错误的。
`;

describe("estimateTokenCount", () => {
  it("tokenizes exactly at or below the threshold", () => {
    const text = SOURCE.repeat(200);
    expect(text.length).toBeLessThanOrEqual(LARGE_BUNDLE_CHARS);
    expect(estimateTokenCount(text)).toBe(exact(text));
  });

  it("lands within 5% of the true count on source code above the threshold", () => {
    const text = oversize(SOURCE.repeat(40));
    expect(text.length).toBeGreaterThan(LARGE_BUNDLE_CHARS);
    const error = Math.abs(estimateTokenCount(text) - exact(text)) / exact(text);
    expect(error).toBeLessThan(0.05);
  });

  it("lands within 5% on CJK text, where characters / 4 was wrong by a factor", () => {
    const text = oversize(PROSE_CJK.repeat(40));
    expect(text.length).toBeGreaterThan(LARGE_BUNDLE_CHARS);
    const truth = exact(text);
    const error = Math.abs(estimateTokenCount(text) - truth) / truth;
    expect(error).toBeLessThan(0.05);

    // The rule this replaced, scored on the same text, to keep the reason for
    // the change visible in the suite rather than only in a commit message.
    const oldRule = Math.ceil(text.length / 4);
    expect(Math.abs(oldRule - truth) / truth).toBeGreaterThan(0.3);
  });

  it("stays accurate when the text is not uniform", () => {
    // Half source, half prose. A prefix-only sample would read the first half
    // and call the whole bundle code.
    const text = oversize(SOURCE.repeat(40)) + oversize(PROSE_CJK.repeat(40));
    const truth = exact(text);
    const error = Math.abs(estimateTokenCount(text) - truth) / truth;
    expect(error).toBeLessThan(0.1);
  });
});

/**
 * A bundle whose token density changes along its length: the early files are
 * source, the later ones are CJK prose, and the file sizes vary. Where the
 * sample slices land therefore decides what ratio they report, which is what
 * let the output style move the estimate the wrong way.
 */
function gradientCorpus(n: number) {
  const files: { path: string; content: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cjkShare = i / n;
    const reps = 20 + (i % 7) * 12;
    const body: string[] = [];
    for (let j = 0; j < reps; j++) body.push(j / reps < cjkShare ? PROSE_CJK : SOURCE);
    files.push({ path: `src/module-${i}/file-${i}.ts`, content: body.join("") });
  }
  return files;
}

const STYLES: OutputStyle[] = ["xml", "markdown", "plain"];

/** The styles, cheapest first. */
function ranking(counts: Record<OutputStyle, number>): OutputStyle[] {
  return [...STYLES].sort((a, b) => counts[a] - counts[b]);
}

describe("estimateBundleTokens", () => {
  beforeAll(async () => {
    await preloadTokenEstimator();
    // Until that resolves the shim answers characters / 4, which ranks the
    // styles by length and would rank them wrong. CJK is where the two are
    // furthest apart, so it is what proves the real tokenizer is in.
    expect(shimEstimate(PROSE_CJK)).toBe(exact(PROSE_CJK));
  });

  const files = gradientCorpus(300);
  const paths = files.map((f) => f.path);
  const tree = generateFileTree(paths);
  const projectName = generateProjectName(paths);

  function options(style: OutputStyle) {
    return { projectName, files, tree, style };
  }

  it("ranks the three styles the way an exact count does", () => {
    const exactCounts = {} as Record<OutputStyle, number>;
    const estimates = {} as Record<OutputStyle, number>;

    for (const style of STYLES) {
      const text = assembleOutput(options(style));
      expect(text.length).toBeGreaterThan(LARGE_BUNDLE_CHARS);
      exactCounts[style] = exact(text);
      estimates[style] = estimateBundleTokens(options(style));
      const error = Math.abs(estimates[style] - exactCounts[style]) / exactCounts[style];
      expect(error).toBeLessThan(0.05);
    }

    // The bug this pins: estimating the assembled string sampled a different
    // set of slices per style, so Plain could report more tokens than XML while
    // costing fewer.
    expect(ranking(estimates)).toEqual(ranking(exactCounts));
    expect(exactCounts.plain).toBeLessThan(exactCounts.xml);
  });
});
