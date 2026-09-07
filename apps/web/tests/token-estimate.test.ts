import { describe, expect, it } from "vitest";
import { encoding_for_model } from "@dqbd/tiktoken";

import { estimateTokenCount } from "~/lib/tokens-client";
import { LARGE_BUNDLE_CHARS } from "~/lib/tokens";

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
