# Docs revamp — design spec

Captured 2026-06-12. Implements NEXT_STEPS Tier 2 #5.

## Goal

Bring `apps/web/src/content/docs/` in line with the post-2026-06-07 workbench
redesign. Today's MDX pages describe a UI (`Settings panel`, `Fetch Files`
button, `Reset Patterns`) that no longer exists, advertise features that were
removed (`removeEmptyLines`) or never shipped (PAT input on gitlab), and omit
the mental models a new user actually needs (filter precedence, token costs,
the live-reactive filter loop).

## Scope

- Rewrite every existing MDX page in `apps/web/src/content/docs/` so it
  matches the current `/app` surface.
- Add three new pages: `bitbucket-import.mdx`, `filter-precedence.mdx`,
  `token-costs.mdx`.
- Restructure the sidebar in `apps/web/src/components/docs-layout.tsx` from
  the current three sections (Getting started / Features / Advanced) to
  three new ones: **Getting started**, **Sources**, **Reference**.
- Update the sitemap generator if it scans MDX names (otherwise no change —
  routes are already file-based via `docs/$slug.tsx`).

## Out of scope

- PAT / token input UI for github/gitlab/bitbucket — that is NEXT_STEPS
  Tier 3 #8 and lives on its own ticket. If it ships, the relevant import
  page gets a single follow-up paragraph; no docs-revamp blocker.
- Screenshots, illustrations, callout MDX components. Current MDX render
  pipeline is vanilla markdown + `rehype-prism-plus`; we ship words and
  fenced code blocks, nothing more.
- Docs versioning, search, ToC sidebar, breadcrumbs, prev/next links. Surface
  unchanged.
- CLI workspace removal — per NEXT_STEPS the CLI stays; docs cover it.

## Information architecture

```
Getting started
  Introduction              /docs              (existing intro.mdx, rewritten)
  Quick start               /docs/quick-start  (rewritten)

Sources
  GitHub import             /docs/github-import   (rewritten, includes Gist sub-section)
  GitLab import             /docs/gitlab-import   (rewritten)
  Bitbucket import          /docs/bitbucket-import (NEW)

Reference
  File filtering            /docs/file-filtering    (rewritten)
  Filter precedence         /docs/filter-precedence (NEW)
  Token estimation          /docs/token-estimation  (rewritten)
  Token costs               /docs/token-costs       (NEW)
  Configuration             /docs/configuration     (rewritten)
  CLI usage                 /docs/cli-usage         (rewritten)
```

11 pages, 3 sidebar sections. URL-fallback adapter (`url.ts`) does not get
its own page — it earns a single sentence in the Sources section
introduction (top of GitHub import: "Anything we do not recognise as a
known host is downloaded as a raw file via the URL fallback adapter").

### Sidebar nav diff

`apps/web/src/components/docs-layout.tsx` `DOCS_NAVIGATION` constant:

- Rename `Features` → `Sources`; replace links with `github-import`,
  `gitlab-import`, `bitbucket-import`.
- Rename `Advanced` → `Reference`; expand to `file-filtering`,
  `filter-precedence`, `token-estimation`, `token-costs`, `configuration`,
  `cli-usage`.
- `Getting started` unchanged.

## Voice & format rules

- **Register: BRAND** (per napkin). `/docs` is brand-facing reference,
  not the workbench. Plain, declarative, procedural. No marketing voice;
  no second-person "you'll love…".
- **Length per page: 300-500 words** for most. The two NEW reference pages
  (`filter-precedence`, `token-costs`) are mental-model pages and may run
  to 600-800 words. Shorter is fine if the topic does not earn more.
- **Code blocks** — fenced with explicit language tags (` ```bash `,
  ` ```ts `, ` ```mdx `, ` ```json `) so `rehype-prism-plus` highlights.
  Current docs use bare ` ``` ` — that gets fixed in the rewrite.
- **No em dashes** (napkin brand ban).
- **No twin card grids, eyebrows, side-stripes** (napkin) — though docs
  are markdown so this barely applies; still: do not introduce custom MDX
  components that mimic those shapes.
- **Internal links** use absolute paths (`/docs/filter-precedence`), not
  relative `./filter-precedence`. Current pages already do this; preserve.
- **Heading levels** — H1 is the page title; do not stack multiple H1s.
  Use H2 for sections, H3 sparingly.

## Per-page content plan

Each page outlined to bullets. Word target in parens. Each bullet must
trace to a fact verified against current source (file pointers given).

### `introduction.mdx` (~350 words, rewrite)

- What FileConcat is (a privacy-first file concatenator) and what it
  produces (single LLM-ready blob, XML or markdown).
- 100% client-side processing (`packages/core` runs in the browser,
  no server upload).
- Where to get it: web at fileconcat.com; CLI `pnpm add -g fileconcat`.
- Quick visual list of supported sources (drop, github, gitlab,
  bitbucket, gist, URL fallback) — names only, no marketing claims.
- Links into Quick start, File filtering, Token estimation.
- **Cuts** vs current intro: "Smart Token Estimation" generic claim,
  "Multiple Input Sources" header (replaced by short list), "Getting
  Started" footer (the Quick start link already does that).

### `quick-start.mdx` (~400 words, rewrite)

- Path A: local files. Drag onto the dropzone → tree renders →
  toggle individual files via checkbox → click **Copy** or **Download**
  in the ActionBar. No "Settings panel" anywhere.
- Path B: remote source. Paste URL into the SourceBar → press
  Enter / Import → tree renders → same Copy/Download flow.
- Per-fact verification target: `apps/web/src/app.tsx` (ActionBar
  buttons), `apps/web/src/components/landing/hero.tsx` (drop flow),
  `apps/web/src/components/source-input.tsx` (URL flow).
- **Cuts** vs current quick-start: "Settings panel" mention,
  "Fetch Files" button name, "Save your most common patterns as
  presets" (presets are baked chips, not user-saveable).

### `github-import.mdx` (~500 words, rewrite)

- URL shapes recognised by `packages/core/src/sources/adapters/github.ts`:
  `https://github.com/owner/repo`,
  `https://github.com/owner/repo/tree/<branch>`,
  `https://github.com/owner/repo/tree/<branch>/<subPath>`.
- Subdirectory imports limit the tree to the subpath (commit `f3b40cf`
  shipped the integration test for this).
- Unauthenticated rate limit: **60 requests/hour per IP** (one repo can
  consume several requests). 401/403/429 errors surface via
  `classifyResponseError`.
- **Gist** sub-section: URL shapes
  `https://gist.github.com/<user>/<gistId>` and
  `https://gist.github.com/<gistId>`. Uses the same flow; gist files
  are flat (no subdirectories).
- URL fallback note: a paragraph in this page or in introduction.
- Cross-links: file filtering (post-import you can ignore folders),
  token estimation.

### `gitlab-import.mdx` (~350 words, rewrite)

- URL shapes recognised by `gitlab.ts`:
  `https://gitlab.com/owner/repo`,
  `https://gitlab.com/owner/repo/-/tree/<branch>`,
  `https://gitlab.com/owner/repo/-/tree/<branch>/<subPath>`.
- gitlab.com only — self-hosted gitlab is not supported.
- **DROP** the "Private repositories require a token" line. PAT input
  is not shipped. When it ships (NEXT_STEPS Tier 3 #8), one paragraph
  added here covers it.
- Same 401/403/429 surfacing via classifier.

### `bitbucket-import.mdx` (~350 words, NEW)

- URL shapes recognised by `bitbucket.ts`. Verify against the adapter
  before writing — historically bitbucket cloud URLs:
  `https://bitbucket.org/workspace/repo` and
  `https://bitbucket.org/workspace/repo/src/<branch>/<subPath>`.
- bitbucket.org only (cloud, not self-hosted Server / Data Center).
- Same error surfacing.

### `file-filtering.mdx` (~500 words, rewrite)

- What "include" and "ignore" textareas do: comma- or newline-separated
  glob list, edited live, tree updates with no Apply button.
- `pathMatches(filePath, pattern)` semantics
  (`packages/core/src/path-utils/glob-match.ts`):
  bare directory name matches at any depth (`node_modules` matches
  `apps/web/node_modules/react/index.js`); slashed patterns try full
  match plus every leading-directory strip. This is the surprising bit
  and earns a worked example.
- Preset chips: what they do (one-click textarea replacement, not
  additive), how to revert (click again to clear).
- Cross-link to Filter precedence for the full mental model.

### `filter-precedence.mdx` (~700 words, NEW)

- The full pipeline, top to bottom:
  1. **Drop-time prune** — `HARDCODED_PRUNE_DIRS = {".git", "node_modules"}`
     skipped before ingestion (browser-crash safety).
     Source: `apps/web/src/app.tsx`.
  2. **Validation cache** — each ingested file is checked once for
     binary content + size limit. Result lives in
     `validations: Record<path, ValidationRecord>`.
  3. **Live pattern layer** — `includePatterns` (whitelist) then
     `ignorePatterns` (blacklist) applied at filter time via
     `matchesAnyPattern`.
  4. **Manual overrides** — `userToggled: Record<path, "include"|"exclude">`
     is sticky and wins over patterns. The "clear" button resets only
     this layer.
- Why drop-time vs filter-time matters: dropping a repo with `dist/`
  in it brings dist files into memory; they only disappear once a
  pattern hides them. Acceptable for typical projects, audit if drops
  feel slow.
- Cross-link to File filtering for pattern syntax.

### `token-estimation.mdx` (~400 words, rewrite)

- Tokenizer is `@dqbd/tiktoken` (cl100k_base by default).
- 1 MB self-cap: inputs over 1 MB fall back to `length / 4`
  (`apps/web/src/lib/tokens.ts`). This is why very large files show
  approximate counts.
- Model selector: pulls catalog from `models.dev`, surfaces canonical
  models sorted by release date desc. "via X" hint shows the cheapest
  priced provider for that canonical model. UID format `lab/model-id`
  stays stable across deploys even when cheapest provider changes.
- Cross-link to Token costs for the cost-of-toggles breakdown.

### `token-costs.mdx` (~600 words, NEW)

- Why this page exists: the workbench has knobs that change the token
  count. Some are obvious (more files = more tokens), some are not.
- **`addLineNumbers` costs +~45% tokens** (measured 2026-06-07,
  napkin). Navigation aid, not a saving. Labelled accordingly in
  `filter-rail.tsx`.
- **`removeEmptyLines` was removed.** Measured +5.93% tokens, never
  -, on CRLF input. Do not look for it in the UI; it is gone.
- **XML vs markdown style** — note any measured differences if we
  have them; otherwise: "the difference is small; pick whichever your
  assistant handles better".
- **Single vs multiple-files output** — multi splits at the configured
  chunk size; the per-file headers add tokens but enable feeding huge
  projects across multiple turns.
- Cross-link to Token estimation for the tokenizer itself.

### `configuration.mdx` (~600 words, rewrite — full scope)

- **ActionBar Options popover** (single source of truth in
  `apps/web/src/components/action-bar.tsx` or equivalent):
  - single vs multiple-files output
  - xml vs markdown style
  - chunk size (when multi)
  - `addLineNumbers` toggle
- **FilterRail Advanced section** — any toggles that live there.
  Verify against current `filter-rail.tsx` before writing.
- **User-level persistence** — `UserConfig` schema v5
  (`apps/web/src/hooks/use-config.ts`); what survives across sessions
  (patterns, output style, chunk size). Migration is transparent;
  user does not action it.
- **Recent sources** — what is remembered, where it lives
  (localStorage), how to clear (currently: clear browser storage; no
  in-app affordance yet — state this honestly).

### `cli-usage.mdx` (~450 words, rewrite)

- Install: `pnpm add -g fileconcat` or `npx fileconcat`.
- Default vs explicit `concat` command (both same flag set per
  `packages/cli/src/index.ts`).
- Full flag table:
  | flag | shorthand | default | notes |
  | `[path]` | — | `.` | positional |
  | `--output` | `-o` | `output.xml` / `output.md` | by style |
  | `--max-size <mb>` | `-m` | `32` | per-file cap |
  | `--no-hidden` | — | (defaults to exclude) | |
  | `--no-binary` | — | (defaults to exclude) | |
  | `--exclude <patterns…>` | `-e` | — | repeatable glob list |
  | `--config <file>` | `-c` | — | json/yaml config |
  | `--style <style>` | `-s` | `xml` | `xml` \| `markdown` \| `md` |
- Config file shape: link to `packages/cli/src/config.ts`
  (`FileConcatConfig` type). Show a minimal example.
- Cross-link to File filtering (same pattern semantics in web + CLI).

## Fact-checking discipline

For every claim that names a file path, function, default value, flag,
URL shape, or error message: open the actual source before writing the
sentence. Doc claims that cannot be traced to a current source line do
not ship. Files that anchor most claims:

- `apps/web/src/app.tsx` — workbench composition, HARDCODED_PRUNE_DIRS
- `apps/web/src/components/filter-rail.tsx` — pattern textareas, presets,
  Advanced toggles
- `apps/web/src/components/action-bar.tsx` (or equivalent) — Options
  popover
- `apps/web/src/components/source-input.tsx` — URL parsing surface
- `apps/web/src/hooks/use-config.ts` — UserConfig schema
- `apps/web/src/hooks/use-recent-sources.ts` — recent sources persistence
- `apps/web/src/lib/tokens.ts` — tokenizer + 1 MB cap
- `packages/core/src/path-utils/glob-match.ts` — pattern matcher
- `packages/core/src/sources/adapters/*.ts` — URL shapes, error paths
- `packages/cli/src/index.ts`, `packages/cli/src/commands/concat.ts`,
  `packages/cli/src/config.ts` — CLI surface

## Migration plan

Order chosen so each commit leaves the docs surface valid:

1. **Sidebar nav update** in `docs-layout.tsx` — add the three new entries
   pointing at slugs that do not yet exist. Routes are 404 until step 2,
   but the existing 8 pages keep working.
2. **Three new MDX files** in one commit: `bitbucket-import.mdx`,
   `filter-precedence.mdx`, `token-costs.mdx`. Routes wire up via the
   `$slug` loader's `import.meta.glob`.
3. **Rewrite the 8 existing pages** — can land per-page or in one commit;
   suggested split: Getting started pair, Sources pair, Reference set.
4. **Sitemap regenerate** — `apps/web/scripts/generate-sitemap.ts` runs
   at prebuild, will pick up new routes automatically. No manual edit.

After landing: `pnpm check` + `pnpm lint` + visual click-through on
`pnpm dev` to confirm all 11 pages render and internal links resolve.

## Risks

- **Docs rot** if NEXT_STEPS Tier 3 #8 (PAT) ships shortly after. Mitigation:
  PAT page change is a single paragraph in `gitlab-import.mdx` (and likely
  `github-import.mdx`); cheap to amend.
- **Sidebar IA surprises returning users** who bookmarked
  `/docs/file-filtering` etc. Slugs do not change, only the nav grouping
  does — no broken links.
- **Fact-check fatigue** — the discipline above is non-negotiable; if
  shortcuts creep in we re-introduce the same problem this revamp fixes.

## Success criteria

- Every claim about UI, flag, or default in the new docs traces to a
  currently-present source line.
- `gitlab-import.mdx` no longer mentions a token input.
- `quick-start.mdx` no longer mentions a Settings panel or Fetch Files
  button.
- `configuration.mdx` describes the ActionBar Options popover, FilterRail
  Advanced section, UserConfig v5 persistence, and recent-sources state.
- New `filter-precedence.mdx` explains drop-time vs filter-time, the
  four-layer pipeline, and the override-stickiness invariant.
- New `token-costs.mdx` documents the `addLineNumbers` +45% cost and the
  removal of `removeEmptyLines`.
- New `bitbucket-import.mdx` exists with verified URL shapes.
- Sidebar shows three sections (Getting started, Sources, Reference) with
  11 entries total.
- `pnpm check` + `pnpm lint` clean.
