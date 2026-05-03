# Napkin

## Corrections

| Date       | Source | What Went Wrong                                                                 | What To Do Instead                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 2026-02-08 | self   | Typecheck failed in Bitbucket adapter due to implicit any on API response data. | Add explicit response payload typing when calling `response.json()` for adapter API shapes. |

## User Preferences

- This repo's `.claude/settings.json` sets `attribution.commit: ""` and `attribution.pr: ""` — the documented Claude Code way to suppress the `Co-Authored-By: Claude ...` trailer and the "Generated with Claude Code" footer. **Honour it: never add either to commits or PRs in this repo.** If a session started before that file existed, the runtime won't have applied the override — manually omit the trailer/footer regardless.

## Patterns That Work

- For TanStack Start in apps/web, Cloudflare config expects `.output/server/index.mjs` and `.output/public` (not `dist/`).
- Treat `.output/` as a build artifact; keep it out of git to avoid empty `index.mjs` in dev.

## Patterns That Don't Work

- `minimatch(fullPath, "node_modules", { dot: true })` does NOT match `"node_modules/react/index.js"`. minimatch matches the entire path against the pattern; bare directory names match only the exact string. To honour bare-name ignore patterns, also test each path segment individually (`path.split("/").some(seg => minimatch(seg, pattern))`).

## Domain Notes

- ESLint config (`eslint.config.js`) is minimal — no `argsIgnorePattern` for `_`-prefixed names. So `const _foo = bar()` STILL trips `@typescript-eslint/no-unused-vars`. Either delete the assignment or actually consume it; the underscore prefix is not a ts-eslint escape hatch in this repo.
- Catch-clauses without a binding (`catch { ... }`) are the right way to silence unused-`error` lint, since the rule applies to caught errors here.
- `addLineNumbers` in `packages/core/src/file-processing/transform.ts` must drop a trailing empty element after `split("\n")` so a final newline doesn't produce a phantom numbered line. Tests in `tests/file-processing.test.ts` rely on this.
