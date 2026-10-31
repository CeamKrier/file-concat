import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { extractOne, webExtract } from "../scripts/web-chain.js";

/**
 * Every probe file through the web's real readers, held to a snapshot: a reader
 * upgrade, a re-ported liteparse patch or a router change that loses a word, adds
 * one, or moves a file to another reader fails here.
 *
 * Words are counted, not ordered, so a layout change that only moves whitespace
 * or lines passes. ponytail: order inside a file is not checked (interleaved
 * columns read as the same words); a per-file line diff if that ever bites.
 *
 * The probes are synthetic, one construct each. A loss on real documents only
 * shows on the real-corpus run every reader upgrade needs, and browser-only
 * breakage (the pdf.js worker) is apps/web's tests. `html/` is left out: its
 * reader needs a DOM, and apps/web/tests/extract-html.test.ts runs it.
 *
 * `liteparse-patches/` adds a page a vendored liteparse patch reads differently
 * from upstream (see its generate.mjs).
 *
 * After an intended change: `pnpm vitest run probes -u`, and read the JSON diff.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBES = path.join(HERE, "..", "scripts", "coverage", "probes");
const SKIP_DIRS = new Set(["html"]);
const DIRS = [
  ...fs
    .readdirSync(PROBES)
    .sort()
    .filter((d) => !SKIP_DIRS.has(d) && fs.statSync(path.join(PROBES, d)).isDirectory())
    .map((d) => [d, path.join(PROBES, d)]),
  ["liteparse-patches", path.join(HERE, "fixtures", "liteparse-patches")],
];

const words = (text: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const [w] of text.toLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu)) counts[w] = (counts[w] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
};

test("probe files read the same", { timeout: 60_000 }, async () => {
  const seen: Record<string, unknown> = {};
  for (const [dir, full] of DIRS) {
    for (const file of fs.readdirSync(full).sort()) {
      if (file.startsWith("ORACLE") || file.endsWith(".mjs")) continue;
      const r = await extractOne(full, file, webExtract);
      seen[`${dir}/${file}`] = {
        reader: `${r.route}${r.parserId ? `/${r.parserId}` : ""}`,
        notes: r.notes,
        ...(r.error ? { error: r.error } : {}),
        words: words(r.text),
      };
    }
  }
  await expect(JSON.stringify(seen, null, 1) + "\n").toMatchFileSnapshot("__snapshots__/probes.json");
});
