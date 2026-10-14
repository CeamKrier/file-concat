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
  { name: "word: FileConcat, not the tab", pattern: /\bin the tab\b/ },
  { name: "word: Drop, not Drag", pattern: /title="Drag / },
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
      prose(readFileSync(path, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          for (const rule of RULES) {
            if (rule.only && !rule.only.test(rel)) continue;
            const m = line.match(rule.pattern);
            if (m) hits.push(`${rel}:${i + 1} [${rule.name}] ${m[0].trim()}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
