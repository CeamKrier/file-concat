// usage: tsx dump-corpus.mts <dir>
// Writes the 45 hard files of packages/core/tests/fixtures/unreadable-corpus.ts, one
// folder per case, and manifest.json with what each case should come back as.
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCorpus } from "../../../../core/tests/fixtures/unreadable-corpus";

const dir = process.argv[2];
const manifest = buildCorpus().map((c) => {
  mkdirSync(`${dir}/${c.name}`);
  writeFileSync(`${dir}/${c.name}/${c.file}`, c.bytes);
  return { name: c.name, file: c.file, expect: c.expect, text: c.text ?? null };
});
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1));
