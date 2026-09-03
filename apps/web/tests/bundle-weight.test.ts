import { describe, expect, it } from "vitest";
import { LARGE_BUNDLE_CHARS } from "~/lib/tokens";
import { DOMINANT_FILE_RATIO, weighBundle } from "~/lib/bundle-weight";

const model = { name: "Claude Sonnet 4.5", contextLimit: 200_000 };
const file = (path: string, chars: number) => ({ path, content: "x".repeat(chars) });

describe("bundle weight", () => {
  it("says nothing when the bundle fits and is small", () => {
    const w = weighBundle({ files: [file("a.ts", 500)], tokens: 20_000, model });
    expect(w.hasWarning).toBe(false);
    expect(w.fit?.level).toBe("fine");
    expect(w.dominant).toBeNull();
  });

  it("turns tight at 80% of the window and over at 100%", () => {
    const at = (tokens: number) => weighBundle({ files: [file("a.ts", 10)], tokens, model }).fit;
    expect(at(159_000)?.level).toBe("fine");
    expect(at(160_000)?.level).toBe("tight");
    expect(at(199_999)?.level).toBe("tight");
    expect(at(200_000)?.level).toBe("over");
    expect(at(320_000)?.ratio).toBeCloseTo(1.6);
  });

  it("never reports a fit without a model, and never against a missing limit", () => {
    expect(weighBundle({ files: [file("a.ts", 10)], tokens: 9e9, model: null }).fit).toBeNull();
    // A zero context limit is missing data. Dividing by it would report a
    // fabricated "over" on every bundle.
    const broken = weighBundle({
      files: [file("a.ts", 10)],
      tokens: 100,
      model: { name: "Mystery", contextLimit: 0 },
    });
    expect(broken.fit).toBeNull();
    expect(broken.hasWarning).toBe(false);
  });

  it("flags the browser cost past 1 MiB on its own axis", () => {
    const big = weighBundle({
      files: [file("dump.csv", LARGE_BUNDLE_CHARS + 1)],
      tokens: 1_000,
      model,
    });
    expect(big.isLarge).toBe(true);
    // Fits the window comfortably and still warrants a warning: the two axes
    // are independent, which is the whole reason the old byte cap was wrong.
    expect(big.fit?.level).toBe("fine");
    expect(big.hasWarning).toBe(true);
  });

  it("names a dominant file only once something else already applies", () => {
    const files = [file("dump.csv", 700), file("a.ts", 300)];
    const quiet = weighBundle({ files, tokens: 100, model });
    expect(quiet.dominant).toBeNull();

    const loud = weighBundle({ files, tokens: 180_000, model });
    expect(loud.dominant).toEqual({ path: "dump.csv", share: 0.7 });
  });

  it("holds the dominant-file threshold at exactly 30% of the bundle", () => {
    // Four files, so the leader can sit at the boundary rather than being
    // forced over half by arithmetic.
    const rest = [file("a.ts", 234), file("b.ts", 233), file("c.ts", 233)];
    const at = [file("big.csv", DOMINANT_FILE_RATIO * 1000), ...rest];
    expect(weighBundle({ files: at, tokens: 180_000, model }).dominant?.path).toBe("big.csv");

    const below = [file("big.csv", 299), file("a.ts", 235), ...rest.slice(1)];
    expect(weighBundle({ files: below, tokens: 180_000, model }).dominant).toBeNull();
  });

  it("prices one send off the input rate alone", () => {
    // 100k tokens at $3 per million. The reply is deliberately not in it: any
    // guess at how long an answer runs is a number we invented.
    const priced = { ...model, inputCost: 3 };
    const w = weighBundle({ files: [file("a.ts", 10)], tokens: 100_000, model: priced });
    expect(w.prefill?.usd).toBeCloseTo(0.3);
    expect(w.prefill?.modelName).toBe(model.name);

    // It follows the token count, not the byte count.
    expect(
      weighBundle({ files: [file("a.ts", 10)], tokens: 1_000_000, model: priced }).prefill?.usd,
    ).toBeCloseTo(3);
  });

  it("refuses to price a bundle it has no rate for", () => {
    // A model with no pricing in the catalogue carries inputCost 0, and "$0.00"
    // for a model somebody pays for is worse than saying nothing.
    expect(
      weighBundle({ files: [], tokens: 100_000, model: { ...model, inputCost: 0 } }).prefill,
    ).toBeNull();
    // Absent rather than zero, same answer.
    expect(weighBundle({ files: [], tokens: 100_000, model }).prefill).toBeNull();
    // No model at all.
    expect(weighBundle({ files: [], tokens: 100_000, model: null }).prefill).toBeNull();
  });

  it("prices a bundle whose context window is unknown", () => {
    // Fit and price are independent facts. A catalogue entry can carry a rate
    // and no window, and the price is still true.
    const w = weighBundle({
      files: [],
      tokens: 100_000,
      model: { name: "Mystery", contextLimit: 0, inputCost: 3 },
    });
    expect(w.fit).toBeNull();
    expect(w.prefill?.usd).toBeCloseTo(0.3);
  });

  it("survives an empty bundle", () => {
    const w = weighBundle({ files: [], tokens: 0, model });
    expect(w.chars).toBe(0);
    expect(w.dominant).toBeNull();
    expect(w.hasWarning).toBe(false);
  });
});
