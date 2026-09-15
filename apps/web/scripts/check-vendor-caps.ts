#!/usr/bin/env npx tsx
/**
 * Build-time drift check for the vendor caps the site states (ChatGPT Project
 * files per plan, Claude's context window, Gemini Notebook sources, ...).
 *
 * `src/data/vendor-caps.json` pins each figure to the sentence it was read
 * from. This script fetches every source page and looks for those sentences.
 *
 * - Quote present: fine.
 * - Page unreachable, or reachable but without its anchor (the article title):
 *   we could not check. Warn and carry on, because a bot wall or a build
 *   container with no egress must never block a deploy.
 * - Anchor present, quote gone: the vendor reworded or changed the figure.
 *   Fail the build. The fix is a human read of the page, the number in
 *   `used_by`, then the quote and `checked` date in the JSON.
 *
 * It detects drift and never writes a number: a figure pulled out of prose by
 * a regex is exactly the kind of invented cap this exists to keep off the site.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

interface Source {
  url: string;
  anchor: string;
  checked: string;
  quotes: string[];
  used_by: string[];
}

const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "../src/data/vendor-caps.json");
const TIMEOUT_MS = 15_000;
// The help centers serve their bot page to a bare fetch UA; a browser UA gets
// the article.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Visible text of the page: tags and scripts out, entities decoded, curly
 * apostrophes straightened, whitespace collapsed, lowercased. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|\u2019/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return textOf(await res.text());
}

async function check(source: Source): Promise<{ drifted: string[]; unchecked?: string }> {
  let text: string;
  try {
    text = await fetchText(source.url);
  } catch (error) {
    return { drifted: [], unchecked: error instanceof Error ? error.message : String(error) };
  }
  if (!text.includes(source.anchor.toLowerCase())) {
    return { drifted: [], unchecked: `anchor "${source.anchor}" not on the page` };
  }
  const drifted = source.quotes.filter((q) => !text.includes(q.toLowerCase()));
  return { drifted };
}

async function main() {
  const { sources } = JSON.parse(readFileSync(MANIFEST, "utf8")) as { sources: Source[] };
  const results = await Promise.all(sources.map(async (s) => ({ s, ...(await check(s)) })));

  let failed = 0;
  let unchecked = 0;
  for (const { s, drifted, unchecked: why } of results) {
    if (why) {
      unchecked += 1;
      console.warn(`vendor-caps: could not check ${s.url} (${why})`);
      continue;
    }
    if (drifted.length === 0) {
      console.log(`vendor-caps: ok ${s.url} (${s.quotes.length} quotes, checked ${s.checked})`);
      continue;
    }
    failed += 1;
    console.error(`vendor-caps: DRIFT ${s.url}`);
    for (const q of drifted) console.error(`  missing: "${q}"`);
    console.error(`  re-read the page and fix: ${s.used_by.join(", ")}`);
  }

  console.log(
    `vendor-caps: ${sources.length - failed - unchecked} ok, ${failed} drifted, ${unchecked} unchecked`,
  );
  if (failed > 0) process.exit(1);
}

main();
