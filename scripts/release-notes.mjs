#!/usr/bin/env node
// Prints one version's section of CHANGELOG.md, the body of its GitHub Release.
// Exits 1 when the section has no entries, so the release workflow stops before
// pushing a version nothing user-facing went into (only docs, chore, ci...).
//
//   node scripts/release-notes.mjs v2.3.0
import { readFileSync } from "node:fs";

const version = (process.argv[2] ?? "").replace(/^v/, "");
const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const isHeading = (line) => /^#{2,3} \[?\d+\.\d+\.\d+/.test(line);
const start = lines.findIndex((line) => isHeading(line) && line.match(/\d+\.\d+\.\d+/)[0] === version);
const end = start === -1 ? -1 : lines.findIndex((line, i) => i > start && isHeading(line));
const body = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end);

if (!body.some((line) => line.startsWith("* "))) {
  console.error(`No release notes for ${version} in CHANGELOG.md: nothing user-facing since the last release.`);
  process.exit(1);
}
console.log(body.join("\n").trim());
