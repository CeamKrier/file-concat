import { describe, expect, it } from "vitest";
import type { OutputFile } from "@fileconcat/core";

import {
  ARMS,
  bandOf,
  clusterBootstrap,
  equivalent,
  generateQuestions,
  grade,
  icc,
  injectBrokenReferences,
  isDefinedIn,
  leaksFilename,
  mcnemarMde,
  mcnemarP,
  mcnemarPairs,
  normalizeAnswer,
  parseSample,
  render,
  shuffled,
  type Question,
} from "../scripts/measure-format-eval.js";

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Five files. `sharedHelper` is defined once in helpers.ts and referenced from
 * two other files, so it is injectable and the rename must cover the definition
 * plus all but one referrer. The rest are defined once and used once, so they
 * are available as distractors.
 */
const files: OutputFile[] = [
  {
    path: "src/helpers.ts",
    content: [
      "export function sharedHelper() { return 1; }",
      "const again = sharedHelper();",
      "export const commonThing = 1;",
      "export const otherThing = 2;",
      "export const thirdThing = 3;",
      "export const fourthThing = 4;",
      "export const fifthThing = 5;",
    ].join("\n"),
  },
  { path: "src/app.ts", content: "import { sharedHelper } from './helpers';" },
  { path: "src/also.ts", content: "sharedHelper(); sharedHelper(); sharedHelper();" },
  { path: "src/one.ts", content: "console.log(commonThing, otherThing, fourthThing);" },
  { path: "src/two.ts", content: "console.log(thirdThing, fifthThing);" },
];

describe("bug injection", () => {
  it("leaves exactly one file holding a name nothing defines", () => {
    const { files: mutated, injections } = injectBrokenReferences(files, 1, rng(1));
    const injection = injections.find((i) => i.symbol === "sharedHelper")!;
    // app.ts mentions it once, also.ts three times, so app.ts is left dangling
    // and also.ts is renamed along with the definition.
    expect(injection.referencePath).toBe("src/app.ts");

    const joined = mutated.map((f) => f.content).join("\n");
    expect(joined).toContain(injection.renamed);
    expect(joined.split(/\bsharedHelper\b/).length - 1).toBe(1);
    expect(mutated.find((f) => f.path === "src/app.ts")!.content).toContain("sharedHelper");
    // Word boundary, not substring: the renamed token starts with the old name.
    expect(mutated.find((f) => f.path === "src/also.ts")!.content).not.toMatch(
      /\bsharedHelper\b/,
    );
    expect(mutated.find((f) => f.path === "src/helpers.ts")!.content).not.toMatch(
      /\bsharedHelper\b/,
    );
  });

  it("keeps the distractors defined, so the question is not a giveaway", () => {
    const { files: mutated, injections } = injectBrokenReferences(files, 1, rng(1));
    const joined = mutated.map((f) => f.content).join("\n");
    for (const distractor of injections[0].distractors) {
      expect(distractor).not.toBe(injections[0].symbol);
      expect(isDefinedIn(joined, distractor)).toBe(true);
    }
  });

  it("requires a real definition site, not just two appearances", () => {
    // An imported library symbol appears in two files and is defined in neither.
    // Admitting one would make the question's premise false and give it two
    // right answers.
    expect(isDefinedIn("export function sharedHelper() {}", "sharedHelper")).toBe(true);
    expect(isDefinedIn("const useState = 1;", "useState")).toBe(true);
    expect(isDefinedIn("public static void mainThing() {}", "mainThing")).toBe(true);
    expect(isDefinedIn("import { useState } from 'react';", "useState")).toBe(false);
    expect(isDefinedIn("console.log(useState);", "useState")).toBe(false);

    const imported: OutputFile[] = [
      { path: "a.ts", content: "import { libraryThing } from 'x';\nlibraryThing(); libraryThing();" },
      { path: "b.ts", content: "import { libraryThing } from 'x';\nlibraryThing();" },
    ];
    expect(injectBrokenReferences(imported, 5, rng(1)).injections).toHaveLength(0);
  });

  it("does not touch the original file objects", () => {
    const before = files.map((f) => f.content);
    injectBrokenReferences(files, 5, rng(2));
    expect(files.map((f) => f.content)).toEqual(before);
  });
});

describe("question generation", () => {
  const injected = injectBrokenReferences(files, 1, rng(1));
  const questions = generateQuestions("fx", injected.files, injected.injections, rng(3));

  it("asks for the file holding the undefined reference", () => {
    const bug = questions.find((q) => q.family === "bug")!;
    expect(bug.answer).toBe(injected.injections[0].referencePath);
    expect(bug.prompt).toContain("not defined anywhere");
    // All four options are named, so the model cannot answer from the shape.
    for (const option of [injected.injections[0].symbol, ...injected.injections[0].distractors]) {
      expect(bug.prompt).toContain(option);
    }
  });

  it("generates from the raw file set, so every arm gets the same questions", () => {
    // The prompts carry no tag, fence, heading or tree text: nothing that would
    // privilege one rendering's vocabulary.
    for (const q of questions) {
      expect(q.prompt).not.toMatch(/<file|```|^### |directory_structure/m);
    }
  });

  it("drops a question whose answer path is spelled out in the prompt", () => {
    expect(leaksFilename("Which file contains useAuth here?", "src/useAuth.ts")).toBe(true);
    expect(leaksFilename("Which file contains this line?", "src/useAuth.ts")).toBe(false);
  });

  it("is deterministic for a seed and changes with the seed", () => {
    const asked = (seed: number) =>
      generateQuestions("fx", injected.files, injected.injections, rng(seed)).map((q) => q.prompt);
    expect(asked(3)).toEqual(asked(3));
    expect([4, 5, 6, 7].some((s) => String(asked(s)) !== String(asked(3)))).toBe(true);
  });
});

describe("arms", () => {
  const out = Object.fromEntries(
    ARMS.map((arm) => [arm, render(arm, files, "local:fx", rng(9))]),
  );

  it("changes exactly one factor per contrast", () => {
    // A1 minimal: paths, no tree, no fences, no tags.
    expect(out.A1).toContain("src/app.ts");
    expect(out.A1).not.toContain("```");
    expect(out.A1).not.toContain("<file");
    // A2 adds delimiters, still no tree or header.
    expect(out.A2).toContain("### src/app.ts");
    expect(out.A2).toContain("```");
    expect(out.A2).not.toContain("Directory structure");
    // A3 adds the tree and header to A2's delimiters.
    expect(out.A3).toContain("## Directory structure");
    expect(out.A3).toContain("```");
    // A4 swaps markdown for xml, keeping the tree.
    expect(out.A4).toContain("<file path=");
    expect(out.A4).toContain("<directory_structure>");
  });

  it("strips every path in the must-move control and gives NC no context", () => {
    expect(out.A0).not.toContain("src/app.ts");
    expect(out.A0).toContain("<file>");
    expect(out.NC).toBe("");
  });

  it("gives the leakage screen the tree and no file contents", () => {
    expect(out.TR).toContain("app.ts");
    for (const file of files) expect(out.TR).not.toContain(file.content);
  });

  it("keeps every file's content verbatim in all four study arms", () => {
    for (const arm of ["A1", "A2", "A3", "A4"] as const) {
      for (const file of files) expect(out[arm]).toContain(file.content);
    }
  });
});

describe("grading", () => {
  const q: Question = {
    id: "q",
    bundle: "b",
    family: "bug",
    band: 0,
    prompt: "",
    answer: "src/app.ts",
  };

  it("reports raw and normalised separately", () => {
    expect(grade(q, "src/app.ts")).toEqual({ raw: true, normalized: true });
    // A wrapper the arm itself taught: raw fails, normalised passes. Reporting
    // only one of the two would score a formatting habit.
    expect(grade(q, "`src/app.ts`")).toEqual({ raw: false, normalized: true });
    expect(grade(q, "src/other.ts")).toEqual({ raw: false, normalized: false });
  });

  it("strips a trailing period before the quotes", () => {
    expect(normalizeAnswer('"src/app.ts".')).toBe("src/app.ts");
    expect(normalizeAnswer("Here:\n\n`src/app.ts`")).toBe("src/app.ts");
  });
});

describe("clustering", () => {
  it("finds no correlation when bundles behave alike and finds it when they do not", () => {
    const flat = Array.from({ length: 8 }, () => [1, 0, 1, 0, 1, 0]);
    expect(icc(flat)).toBeLessThan(0.05);
    const split = [
      ...Array.from({ length: 4 }, () => [1, 1, 1, 1, 1, 1]),
      ...Array.from({ length: 4 }, () => [0, 0, 0, 0, 0, 0]),
    ];
    expect(icc(split)).toBeGreaterThan(0.9);
  });

  it("widens the interval when the effect lives between bundles, not within", () => {
    // Same pooled difference either way; only the clustering differs.
    const within = Array.from({ length: 10 }, () => ({
      a: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      b: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    }));
    const between = [
      ...Array.from({ length: 5 }, () => ({ a: Array(10).fill(1), b: Array(10).fill(1) })),
      ...Array.from({ length: 5 }, () => ({
        a: Array(10).fill(0),
        b: [...Array(2).fill(0), ...Array(8).fill(0)],
      })),
    ];
    const w = clusterBootstrap(within, 400, rng(11));
    const b = clusterBootstrap(between, 400, rng(11));
    expect(w.hi90 - w.lo90).toBeLessThan(b.hi90 - b.lo90 + 1);
    expect(w.diff).toBeCloseTo(0.1, 5);
  });

  it("declares equivalence only when the whole interval sits inside the margin", () => {
    expect(equivalent(-0.02, 0.03, 0.05)).toBe(true);
    expect(equivalent(-0.02, 0.06, 0.05)).toBe(false);
    expect(equivalent(-0.06, 0.01, 0.05)).toBe(false);
  });
});

describe("power", () => {
  it("matches the McNemar sample size formula", () => {
    // z(0.025) = 1.95996, z(0.80) = 0.84162
    // [1.95996*0.5 + 0.84162*sqrt(0.2475)]^2 / 0.0025 = 782.5
    expect(mcnemarPairs(0.05, 0.25, 0.05, 0.8)).toBeCloseTo(782.5, 0);
  });

  it("inverts itself", () => {
    for (const n of [100, 513, 1026]) {
      const mde = mcnemarMde(n, 0.15, 0.05 / 3, 0.8);
      expect(mcnemarPairs(mde, 0.15, 0.05 / 3, 0.8)).toBeCloseTo(n, 1);
    }
  });

  it("reports no difference when the discordant pairs are balanced", () => {
    expect(mcnemarP(0, 0)).toBe(1);
    expect(mcnemarP(50, 50)).toBeGreaterThan(0.9);
    expect(mcnemarP(80, 20)).toBeLessThan(0.001);
  });
});

describe("sample file", () => {
  it("keeps the primaries before the reserves, in file order", () => {
    const cells = parseSample(
      [
        "# --- TypeScript / small ---",
        "https://example.com/a.git",
        "https://example.com/b.git",
        "# reserve 1: https://example.com/c.git (4572 stars, 607 KB)",
        "",
        "# --- Go / large ---",
        "https://example.com/e.git",
      ].join("\n"),
    );
    expect(cells).toHaveLength(2);
    expect(cells[0].urls).toEqual([
      "https://example.com/a.git",
      "https://example.com/b.git",
      "https://example.com/c.git",
    ]);
    expect(cells[1].language).toBe("Go");
  });
});

describe("position bands", () => {
  it("splits character fractions into five", () => {
    expect([0, 0.19, 0.2, 0.5, 0.99, 1].map(bandOf)).toEqual([0, 0, 1, 2, 4, 4]);
  });

  it("shuffles deterministically for a seed", () => {
    expect(shuffled([1, 2, 3, 4, 5], rng(1))).toEqual(shuffled([1, 2, 3, 4, 5], rng(1)));
  });
});
