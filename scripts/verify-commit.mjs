#!/usr/bin/env node
// Rejects a commit message release-please would not read. The type decides the
// next version (feat minor, fix/perf patch, `!` or BREAKING CHANGE major), and a
// mistyped one is skipped silently, so it has to be caught at commit time.
// Messages git writes itself (merges, reverts, fixup!/squash!/amend!) pass.
//
//   commit-msg hook (.githooks/commit-msg):  node scripts/verify-commit.mjs <message file>
//   CI, over a push's commits:               COMMITS='<push payload commits JSON>' node scripts/verify-commit.mjs
import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "perf", "revert", "docs", "style", "refactor", "test", "build", "ci", "chore"];
const CONVENTIONAL = new RegExp(`^(${TYPES.join("|")})(\\([^()\\s][^()]*\\))?!?: \\S`);
const GIT_WRITTEN = /^(Merge |Revert "|(fixup|squash|amend)! )/;

const subject = (msg) => msg.split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";

const messages = process.argv[2]
  ? [readFileSync(process.argv[2], "utf8")]
  : (JSON.parse(process.env.COMMITS || "null") ?? []).map((c) => c.message);

const bad = messages.map(subject).filter((s) => !CONVENTIONAL.test(s) && !GIT_WRITTEN.test(s));
for (const s of bad) console.error(`Not a conventional commit: "${s}"`);
if (bad.length) {
  console.error(`Write <type>(<scope>): <subject>, with type one of: ${TYPES.join(", ")}.`);
  process.exit(1);
}
