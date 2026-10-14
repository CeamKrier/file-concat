import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Holds the shipped copy to PRODUCT.md, section Voice: the privacy ladder, the
 * word list and the cut-on-sight words. It catches words, not tone; tone is
 * still a read against that section. The extension's panel and the CLI's npm
 * page are shipped copy too.
 */

const REPO = join(__dirname, "..", "..", "..");
const SHIPPED = [
  "apps/web/src/components",
  "apps/web/src/content",
  "apps/web/src/routes",
  "apps/extension/src",
  "apps/extension/entrypoints",
  "packages/cli/README.md",
];

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
  // Also from two cliche corpora read 2026-10-14: clements23/ai-slop-library (MIT, aac5727) and
  // AIStoryHub/AIStoryHub_LLM_Cliche_Corpus (4d90cf4). Left out on purpose: the fiction wing and
  // persona names; plain words with a literal sense here (navigate, harness, unpack, explore,
  // essential, significantly, ultimately); and the ", not X" tail, which is the "this, not that"
  // voice PRODUCT.md itself writes in.
  {
    name: "slop: corpus vocabulary",
    pattern:
      /\b(synerg(y|ies)|game-?changing|revolutionar(y|ize)|leverag(e|es|ed|ing)|transformative|utiliz(e|es|ed|ing)|endeavou?rs?|paradigm|unprecedented|world-class|best-in-class|industry-leading|unlock(s|ed|ing)?|stakeholders?|journey|nurtur(e|es|ed|ing)|cultivat(e|es|ed|ing)|facilitat(e|es|ed|ing)|state-of-the-art|user-friendly|cost-effective|nuanced?|innovation|streamlin(e|es|ed|ing)|resonat(e|es|ed|ing)|embark(s|ed|ing)?|indelible|unwavering|thought leaders?|best practices|nowadays)\b/i,
  },
  {
    name: "slop: corpus phrasing",
    pattern:
      /\b(in today's|in a world where|imagine a world|welcome to the world of|in the world of|when it comes to|at its core|through the lens of|at the forefront|a gateway to|paving the way|paves the way|sheds? light on|new avenues|stark reminder|bring to the table|move the needle|next level|low-hanging fruit|moving forward|at the end of the day|when all is said and done|in a nutshell|food for thought|speaks volumes|only time will tell|possibilities are endless|matter of time|elephant in the room|it goes without saying|needless to say|without further ado|it should be noted|one might argue|here's the thing|let me be clear|let's be honest|to be honest|the truth is|the reality is|the fact is|the real question|believe it or not|it's no secret|no denying|more than just|whether you're an?|key takeaways?|let's unpack|that being said|having said that|all things considered|on the flip side|last but not least|first and foremost|as (previously|we) mentioned|as mentioned (earlier|above)|to put it simply|experts agree|studies (show|suggest)|research suggests|widely believed|have you ever wondered|what if I told you|picture this|let that sink in|read that again|hot take|unpopular opinion|plot twist|as we all know|rapidly evolving|has emerged as|growing body of|circle back|touch base|created equal|not (uncommon|insignificant|unlike|without merit)|far from trivial)\b|\bthat's where\b[^.]{1,40}\bcomes? in\b|\bit's not (just |merely |simply )?[^.!?]{3,60}[.,] it's\b|(^|[.!?]\s+)(To sum up|To summarize|To conclude),|(^|[.!?]\s+)No \w+\. No \w+\./im,
  },
  {
    name: "slop: assistant boilerplate",
    pattern:
      /\b(as an AI|as of my last|I hope this helps|happy to help|great question|feel free to|don't hesitate|reach(ing)? out|finds you well|earliest convenience|let me break (this|it) down)\b|\b(oaicite|contentReference|turn0search|citeturn)/i,
  },
  { name: "word: no analyst terms", pattern: /\b(p90|p10|signal density|n_?eff)\b/i, only: /^apps\/web\/src\/(components|routes)\// },
];

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => {
    const p = join(path, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|mdx|html)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith(".gen.ts") ? [p] : [];
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
    for (const path of SHIPPED.flatMap((p) => files(join(REPO, p)))) {
      const rel = relative(REPO, path).replace(/\\/g, "/");
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
