import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Holds the shipped copy to PRODUCT.md, section Voice: the privacy ladder, the
 * word list and the cut-on-sight words. It catches words, not tone; tone is
 * still a read against that section.
 */

const SRC = join(__dirname, "..", "src");

const RULES: { name: string; pattern: RegExp; only?: RegExp }[] = [
  // Privacy ladder: scope every claim to the files, never past the paste.
  { name: "privacy: scope to the files", pattern: /\b[Nn]othing (is )?uploaded\b(?! to do it)/ },
  { name: "privacy: absolute", pattern: /nothing leaves your (device|machine|computer)|\bno telemetry\b/i },
  { name: "privacy: suitability verdict", pattern: /\bSuitable for\b|\bstays? intact\b/ },
  // Words.
  { name: "word: hype", pattern: /\b(powerful|seamless(ly)?|effortless(ly)?|blazing(ly)?)\b/i },
  { name: "word: actually", pattern: /\bactually\b/i },
  { name: "word: Worth as an opener", pattern: /(^|[.!?]\s+|["'>`]\s*)Worth\b/m },
  { name: "word: bundle, not blob or prompt", pattern: /\b(one|a|single|project) (clean |LLM-ready |prompt-ready )?blob\b|\bclean prompt\b/i },
  { name: "word: in your browser, not the tab", pattern: /\bin (the|this)( browser)? tab\b/i },
  { name: "word: drop, not drag", pattern: /title="Drag |\b[Dd]rag(ged)? (it |them |everything |every \w+ )?in\b|\bdrag[- ]and[- ]drop\b/ },
  // Slop: words and phrases models overuse (Wikipedia, "Signs of AI writing"), only those with
  // no literal sense here. key, landscape and highlight are real things in this product.
  {
    name: "slop: AI vocabulary",
    pattern:
      /\b(delv(e|es|ed|ing)|tapestr(y|ies)|testament|pivotal|crucial(ly)?|meticulous(ly)?|intricate|intricacies|interplay|vibrant|bolster(s|ed|ing)?|garner(s|ed|ing)?|showcas(e|es|ed|ing)|boasts|foster(s|ed|ing)?|enduring|robust(ly|ness)?|multifaceted|groundbreaking|renowned|nestled|quietly|realm|holistic|game-?changer|cutting-edge|unleash(es|ed|ing)?|supercharg(e|es|ed|ing)|elevat(e|es|ed|ing) your|empower(s|ed|ing)?|treasure trove|rest assured)\b|\bunderscor(e|es|ed|ing) (the|its|how|that|a|our|this|why)\b/i,
  },
  {
    name: "slop: AI phrasing",
    pattern:
      /\balign(s|ed)? with\b|\bdeep dive\b|\bdive into\b|\bin the heart of\b|\bevolving landscape\b|\bvaluable insights?\b|\b(serves|stands) as an?\b|\bplays? an? (\w+ )?role\b|\bimportant to (note|remember)\b|\bworth noting\b|(^|[.!?]\s+)(Additionally|Moreover|Furthermore|In summary|In conclusion),|\bnot (just|only)\b[^.;:]{1,80}?,? but( also)?\b/im,
  },
  { name: "word: no analyst terms", pattern: /\b(p90|p10|signal density|n_?eff)\b/i, only: /^(components|routes)\// },
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|mdx)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith(".gen.ts") ? [p] : [];
  });
}

/**
 * Comments, code fences and URLs are not copy. A `//` only counts after whitespace.
 * ponytail: regex stripping, not a parser; a `/*` inside a string would blank real copy, so swap in
 * the TypeScript and MDX parsers if a hit ever hides behind one.
 */
function prose(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/https?:\/\/[^\s"'`)<>]+/g, blank)
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)\/\/.*$/gm, blank);
}

describe("shipped copy follows PRODUCT.md, section Voice", () => {
  it("has no banned phrase", () => {
    const hits: string[] = [];
    for (const path of ["components", "content", "routes"].flatMap((d) => files(join(SRC, d)))) {
      const rel = relative(SRC, path).replace(/\\/g, "/");
      const text = prose(readFileSync(path, "utf8").replace(/\r/g, ""));
      // A wrapped MDX line splits a phrase; join single line breaks, same length so offsets hold.
      const joined = text.replace(/(?<!\n)\n(?!\n)/g, " ");
      for (const rule of RULES) {
        if (rule.only && !rule.only.test(rel)) continue;
        for (const m of joined.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags + "g"))) {
          const line = text.slice(0, m.index).split("\n").length;
          hits.push(`${rel}:${line} [${rule.name}] ${m[0].trim()}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
