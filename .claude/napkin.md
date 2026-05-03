# Napkin

## Corrections

| Date       | Source | What Went Wrong                                                                 | What To Do Instead                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 2026-02-08 | self   | Typecheck failed in Bitbucket adapter due to implicit any on API response data. | Add explicit response payload typing when calling `response.json()` for adapter API shapes. |

## User Preferences

- This repo's `.claude/settings.json` sets `attribution.commit: ""` and `attribution.pr: ""` — the documented Claude Code way to suppress the `Co-Authored-By: Claude ...` trailer and the "Generated with Claude Code" footer. **Honour it: never add either to commits or PRs in this repo.** If a session started before that file existed, the runtime won't have applied the override — manually omit the trailer/footer regardless.

## Patterns That Work

- For SSR-safe browser-only state, guard `useState(initialiser)` and any helper called from a state initialiser with `if (typeof window === "undefined") return <fallback>`. `useEffect` callbacks already only run on the client, so localStorage reads inside an effect are fine without the guard.
- For TanStack Start in apps/web (with `@cloudflare/vite-plugin` v1.22+), the SSR build outputs to `apps/web/dist/server/index.js` and static assets to `apps/web/dist/client/`. Run the worker with `pnpm start` (= `node dist/server/index.js`). The `.output/` convention is from older TanStack Start versions and no longer applies — keep both `dist/` and `.output/` in `.gitignore`.

## Patterns That Don't Work

- `minimatch(fullPath, "node_modules", { dot: true })` does NOT match `"node_modules/react/index.js"`. minimatch matches the entire path against the pattern; bare directory names match only the exact string. To honour bare-name ignore patterns, also test each path segment individually (`path.split("/").some(seg => minimatch(seg, pattern))`).
- Vite's `import.meta.glob("~/some/path/*.mdx")` does NOT resolve the `~` (or any) path alias in the glob pattern — it returns an empty record and every keyed lookup fails. Use a relative path (`"../../content/foo/*.mdx"`) or an absolute path (`"/src/content/foo/*.mdx"`). The keys returned are in the same form you wrote the glob in, so the lookup string must match.
- Calling browser-only APIs (`localStorage`, `window`, `document`, `matchMedia`) at module top level OR inside a `useState(initialiser)` will crash SSR with `ReferenceError: X is not defined`. Always guard.

## Domain Notes

- ESLint config (`eslint.config.js`) is minimal — no `argsIgnorePattern` for `_`-prefixed names. So `const _foo = bar()` STILL trips `@typescript-eslint/no-unused-vars`. Either delete the assignment or actually consume it; the underscore prefix is not a ts-eslint escape hatch in this repo.
- Catch-clauses without a binding (`catch { ... }`) are the right way to silence unused-`error` lint, since the rule applies to caught errors here.
- `addLineNumbers` in `packages/core/src/file-processing/transform.ts` must drop a trailing empty element after `split("\n")` so a final newline doesn't produce a phantom numbered line. Tests in `tests/file-processing.test.ts` rely on this.
