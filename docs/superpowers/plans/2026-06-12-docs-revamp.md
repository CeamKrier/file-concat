# Docs revamp Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/web/src/content/docs/` in line with the current `/app` surface — rewrite 8 stale pages, add 3 new mental-model pages, restructure the sidebar into Getting started / Sources / Reference.

**Architecture:** Pure content + a single sidebar nav constant change. No new MDX components, no new routes. The `$slug.tsx` loader picks up new MDX files automatically via `import.meta.glob`. Discipline: every factual claim in every page must trace to a current source line; pages name their anchor files and the writer reads them before drafting.

**Tech Stack:** MDX (`@mdx-js/react`), `rehype-prism-plus` for code highlighting, `remark-gfm` for tables, TanStack Start file routes, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-12-docs-revamp-design.md` is the contract for what each page must cover. Read it before each chunk.

---

## Pre-flight (read once before starting)

- `docs/superpowers/specs/2026-06-12-docs-revamp-design.md` — the spec.
- `.claude/CLAUDE.md` — repo conventions (CRLF endings, pnpm 10, Nx).
- `.claude/napkin.md` — brand bans (no em-dash, no eyebrows, etc.) and
  measured findings (`removeEmptyLines` removed, `addLineNumbers` +45%).
- Existing 8 MDX files at `apps/web/src/content/docs/*.mdx` so you know
  what the rewrite is replacing.

Anchor files this plan refers to for fact-checking:

| Topic | Anchor file |
| --- | --- |
| Workbench composition, HARDCODED_PRUNE_DIRS | `apps/web/src/app.tsx` |
| FilterRail patterns + presets + Advanced toggles | `apps/web/src/components/filter-rail.tsx` |
| ActionBar Options popover | `apps/web/src/components/action-bar.tsx` (or the equivalent file — verify before writing) |
| Drop / source ingestion | `apps/web/src/components/source-input.tsx`, `apps/web/src/hooks/use-file-ingestion.ts` |
| UserConfig schema v5 | `apps/web/src/hooks/use-config.ts` |
| Recent sources persistence | `apps/web/src/hooks/use-recent-sources.ts` |
| Tokenizer + 1 MB cap | `apps/web/src/lib/tokens.ts` |
| Pattern matcher | `packages/core/src/path-utils/glob-match.ts` |
| URL shapes + error paths per host | `packages/core/src/sources/adapters/{github,gitlab,bitbucket,gist,url}.ts` |
| CLI flag surface | `packages/cli/src/index.ts`, `packages/cli/src/commands/concat.ts`, `packages/cli/src/config.ts` |

Style rules (apply to every page):

- BRAND register, declarative, procedural.
- Length: 300-500 words typical; `filter-precedence` and `token-costs` up
  to 600-800 words.
- Fenced code blocks always carry a language tag (`bash`, `ts`, `mdx`,
  `json`, `xml`, `md`) so `rehype-prism-plus` highlights.
- No em dashes. Use a regular hyphen + spaces, or restructure the sentence.
- Internal links use absolute paths (`/docs/filter-precedence`).
- H1 = page title, only one per file. H2 for sections, H3 sparingly.
- Files are CRLF-terminated (matches `.prettierrc` `endOfLine: "crlf"`).
  Pre-commit Prettier handles this; do not hand-set line endings.

---

## Chunk 1: Sidebar nav update

### Task 1.1: Rewrite DOCS_NAVIGATION

**Files:**
- Modify: `apps/web/src/components/docs-layout.tsx` (the `DOCS_NAVIGATION` constant near line 21-45)

- [ ] **Step 1.1.1: Audit current shape**

Read `apps/web/src/components/docs-layout.tsx`. Confirm `DOCS_NAVIGATION`
is a `DocSection[]` with three sections (Getting started / Features /
Advanced) and the link list matches what is on disk under
`apps/web/src/content/docs/`. If shape has drifted, stop and reconcile.

- [ ] **Step 1.1.2: Replace the constant**

Replace the entire `DOCS_NAVIGATION` declaration with:

```ts
const DOCS_NAVIGATION: DocSection[] = [
  {
    title: "Getting started",
    links: [
      { title: "Introduction", href: "/docs" },
      { title: "Quick start", href: "/docs/quick-start" },
    ],
  },
  {
    title: "Sources",
    links: [
      { title: "GitHub import", href: "/docs/github-import" },
      { title: "GitLab import", href: "/docs/gitlab-import" },
      { title: "Bitbucket import", href: "/docs/bitbucket-import" },
    ],
  },
  {
    title: "Reference",
    links: [
      { title: "File filtering", href: "/docs/file-filtering" },
      { title: "Filter precedence", href: "/docs/filter-precedence" },
      { title: "Token estimation", href: "/docs/token-estimation" },
      { title: "Token costs", href: "/docs/token-costs" },
      { title: "Configuration", href: "/docs/configuration" },
      { title: "CLI usage", href: "/docs/cli-usage" },
    ],
  },
];
```

- [ ] **Step 1.1.3: Verify type-check**

```bash
pnpm check
```

Expected: no errors. The two added slugs (`bitbucket-import`,
`filter-precedence`, `token-costs`) point at MDX files that do not exist
yet; that is a runtime 404, not a TS error. Chunk 2 fixes it.

- [ ] **Step 1.1.4: Commit**

```bash
git add apps/web/src/components/docs-layout.tsx
git commit -m "docs(web): restructure sidebar into Sources + Reference sections"
```

---

## Chunk 2: Three new MDX scaffolds

These minimal stubs let the nav links resolve while Chunks 3-6 land
real content. Each stub renders a heading + a "Coming soon" placeholder.

### Task 2.1: Create `bitbucket-import.mdx` stub

**Files:**
- Create: `apps/web/src/content/docs/bitbucket-import.mdx`

- [ ] **Step 2.1.1: Write stub**

```mdx
# Bitbucket import

This page is under construction.
```

- [ ] **Step 2.1.2: Verify route resolves**

Run `pnpm dev`, navigate to `http://localhost:3000/docs/bitbucket-import`.
Expected: the stub renders, no 404, no console error.

### Task 2.2: Create `filter-precedence.mdx` stub

**Files:**
- Create: `apps/web/src/content/docs/filter-precedence.mdx`

- [ ] Same shape as Task 2.1; title "Filter precedence". Verify route.

### Task 2.3: Create `token-costs.mdx` stub

**Files:**
- Create: `apps/web/src/content/docs/token-costs.mdx`

- [ ] Same shape; title "Token costs". Verify route.

### Task 2.4: Commit all three stubs

- [ ] **Step 2.4.1: Commit**

```bash
git add apps/web/src/content/docs/bitbucket-import.mdx \
        apps/web/src/content/docs/filter-precedence.mdx \
        apps/web/src/content/docs/token-costs.mdx
git commit -m "docs(web): scaffold bitbucket-import, filter-precedence, token-costs"
```

---

## Chunk 3: Reference new pages full content

Two pages of substance. These are the highest-leverage new content
because they document mental models that the existing docs never
captured.

### Task 3.1: `filter-precedence.mdx` (~700 words)

**Files:**
- Modify: `apps/web/src/content/docs/filter-precedence.mdx`

**Anchors to read before writing:**
- `apps/web/src/app.tsx` — find `HARDCODED_PRUNE_DIRS`, the
  `validations` cache, the `userToggled` override map, and the
  `useEffect` that derives `fileStatuses` from `(validations, patterns,
  userToggled)`.
- `packages/core/src/path-utils/glob-match.ts` — `pathMatches` +
  `matchesAnyPattern`.

**Required content (every claim must trace to a line in the anchors):**

- One-paragraph statement: filtering is a four-layer pipeline.
- Layer 1: drop-time prune. Name the exact set
  (`HARDCODED_PRUNE_DIRS = {".git", "node_modules"}`). Explain why
  these two are special (browser memory + crash safety) and that
  everything else is filter-time.
- Layer 2: ingestion-time validation cache. One pass per file checks
  binary + size; result is sticky. Cite the field name.
- Layer 3: live pattern layer. `includePatterns` (whitelist) applied
  first, then `ignorePatterns` (blacklist). Both editable in the
  FilterRail textareas; tree updates with no Apply button.
- Layer 4: manual overrides. `userToggled` is sticky and wins over
  patterns. The "clear" affordance resets only this layer.
- A worked example: drop a repo with `dist/` in it. Drop-time only
  removes `.git` + `node_modules`. To hide `dist`, type it into the
  ignore textarea — the tree updates immediately. If you then
  manually re-include one `dist/foo.js`, editing the ignore pattern
  does not lose your include.
- Cross-link to `/docs/file-filtering` for pattern syntax.

**Tests / verification:**

- [ ] Render the page locally; the four-layer numbered list is visible
  and ordered correctly.
- [ ] Every code reference in the page (`HARDCODED_PRUNE_DIRS`,
  `userToggled`, `pathMatches`, etc.) appears in the named anchor file.
  `grep -n "HARDCODED_PRUNE_DIRS" apps/web/src/app.tsx` must hit.
- [ ] Internal link grep:
  `grep -E "/docs/[a-z-]+" apps/web/src/content/docs/filter-precedence.mdx`
  — every target slug must exist as an MDX file (or be `/docs` for
  introduction).

### Task 3.2: `token-costs.mdx` (~600 words)

**Files:**
- Modify: `apps/web/src/content/docs/token-costs.mdx`

**Anchors:**
- `.claude/napkin.md` "Measured Findings" section (the +5.93% and +45%
  numbers come from there).
- `apps/web/src/components/filter-rail.tsx` — find the
  `addLineNumbers` toggle label and the cost-hint text already shown
  in the UI. Keep doc language consistent with UI label.
- `packages/core/src/file-processing/transform.ts` — `addLineNumbers`
  implementation (so you can describe it accurately).
- Confirm `removeEmptyLines` is absent from `app.tsx`,
  `filter-rail.tsx`, `transform.ts`, and the `UserConfig` type. The
  page asserts it is gone; that assertion must be true.

**Required content:**

- Why this page exists (one paragraph). The workbench has knobs that
  change the token count; some moves cost tokens rather than save them,
  and the user deserves a measured answer.
- `addLineNumbers` section: costs ~+45% tokens (measured 2026-06-07).
  Navigation aid, not a saving. Note the UI labels this in the
  FilterRail.
- `removeEmptyLines` section: removed entirely. Measured +5.93% tokens
  on CRLF input across 8 representative repo files; zero files showed
  savings. Do not look for it; it is not there.
- Single vs multiple-files output: multi splits at the configured chunk
  size; per-file headers add overhead but enable feeding huge projects
  across multiple turns. State what the default chunk size is by
  reading the ActionBar Options source.
- XML vs markdown style: state honestly whether we have a measured
  delta or not. If we do not, say "the difference is small in practice;
  pick whichever your assistant handles better".
- Cross-link to `/docs/token-estimation` (tokenizer itself).

**Tests / verification:**

- [ ] `grep -n "removeEmptyLines" apps/web/src/app.tsx
  apps/web/src/components/filter-rail.tsx
  packages/core/src/file-processing/transform.ts
  apps/web/src/hooks/use-config.ts` returns nothing. Page asserts this.
- [ ] `grep -n "addLineNumbers" apps/web/src/components/filter-rail.tsx`
  hits — the UI label exists. Page uses the same name.
- [ ] Internal link grep as above.

### Task 3.3: Commit Chunk 3

- [ ] **Step 3.3.1: pnpm check + lint**

```bash
pnpm check && pnpm lint
```

Expected: clean (the one pre-existing react-refresh warning in
`staged-files-provider.tsx` is allowed; see NEXT_STEPS).

- [ ] **Step 3.3.2: Commit**

```bash
git add apps/web/src/content/docs/filter-precedence.mdx \
        apps/web/src/content/docs/token-costs.mdx
git commit -m "docs(web): add filter-precedence and token-costs reference pages"
```

---

## Chunk 4: Reference existing pages rewrite

### Task 4.1: `file-filtering.mdx` (~500 words)

**Files:**
- Modify: `apps/web/src/content/docs/file-filtering.mdx`

**Anchors:**
- `apps/web/src/components/filter-rail.tsx` — the two textareas, the
  preset chips, the manual checkbox + clear.
- `packages/core/src/path-utils/glob-match.ts` — for the worked
  "match-anywhere" example.
- `packages/core/src/default-ignore.ts` — the baked-in ignore list.

**Required content:**
- What "include" and "ignore" textareas accept (comma or newline
  separated globs). Live-reactive: tree updates as you type, no Apply
  button.
- `pathMatches` semantics: bare directory names match at any depth;
  slashed patterns match the full path or any suffix obtained by
  stripping leading directories. One worked example with `node_modules`
  vs `src/**/*.ts`.
- Preset chips: what they do (one-click textarea replacement, not
  additive), and that clicking again clears.
- Manual checkboxes: per-file toggles that survive pattern edits, with
  a "clear" affordance to reset.
- Cross-link to `/docs/filter-precedence` for the full pipeline.

### Task 4.2: `token-estimation.mdx` (~400 words)

**Files:**
- Modify: `apps/web/src/content/docs/token-estimation.mdx`

**Anchors:**
- `apps/web/src/lib/tokens.ts` — `estimateTokenCount`, the 1 MB cap,
  the cl100k_base encoding choice.
- `apps/web/src/hooks/use-models.ts` (or equivalent) — model selection.
- `packages/core/src/models/` — `buildTextModelsFromCatalog`, the
  cheapest-provider-per-canonical logic.

**Required content:**
- Tokenizer is `@dqbd/tiktoken`, cl100k_base by default.
- 1 MB self-cap: inputs over 1 MB fall back to `length / 4`. Explain
  the trade (avoids ballooning memory on huge inputs at the cost of
  approximate counts above the cap).
- Model selector: pulls catalog from `models.dev`, canonical models
  sorted by release date desc. "via X" hint shows the cheapest priced
  provider for that canonical. UID format `lab/model-id` stays stable
  across deploys.
- Cross-link to `/docs/token-costs` for the cost-of-toggles breakdown.

### Task 4.3: `configuration.mdx` (~600 words) — full scope per user

**Files:**
- Modify: `apps/web/src/content/docs/configuration.mdx`

**Anchors:**
- The ActionBar Options popover source file. Find it via
  `grep -rln "single.*multi\|chunkSize" apps/web/src/components/`.
- `apps/web/src/components/filter-rail.tsx` — Advanced section, any
  toggles that live there.
- `apps/web/src/hooks/use-config.ts` — `UserConfig` v5 shape, the
  `migrateConfig` behaviour, which fields persist.
- `apps/web/src/hooks/use-recent-sources.ts` — what's stored, where,
  how to clear.

**Required content (in this order):**

1. **In-session configuration**
   - ActionBar Options popover knobs: single vs multiple-files,
     xml vs markdown style, chunk size (visible only when multi),
     `addLineNumbers`. Name each option with the exact label used in
     the UI.
   - FilterRail Advanced section: list any toggles present today.
     Do not invent — if it is just `addLineNumbers`, say so.

2. **Persistent configuration (`UserConfig` v5)**
   - Briefly list the fields that survive across sessions
     (patterns, output style, chunk size, line numbers, etc.).
     Match the actual `UserConfig` type.
   - Migration is transparent — legacy v3/v4 stores are upgraded on
     read; user does not take action.

3. **Recent sources**
   - What is remembered (last N URL imports with their slug).
   - Where it lives (localStorage, under what key — name it).
   - How to clear: currently no in-app affordance; clearing the
     browser storage for the origin clears it. State this honestly.

4. **CLI configuration**
   - One-sentence pointer to `/docs/cli-usage` for the `--config`
     flag and `FileConcatConfig` shape; no detail here.

### Task 4.4: Verify + commit Chunk 4

- [ ] **Step 4.4.1: Internal link grep**

```bash
grep -hE "/docs/[a-z-]+" apps/web/src/content/docs/file-filtering.mdx \
                          apps/web/src/content/docs/token-estimation.mdx \
                          apps/web/src/content/docs/configuration.mdx \
  | grep -oE "/docs/[a-z-]+" | sort -u
```

Expected: every emitted slug exists as `apps/web/src/content/docs/<slug>.mdx`
or is `/docs` (which renders `introduction.mdx`).

- [ ] **Step 4.4.2: pnpm check + lint**

```bash
pnpm check && pnpm lint
```

- [ ] **Step 4.4.3: Commit**

```bash
git add apps/web/src/content/docs/file-filtering.mdx \
        apps/web/src/content/docs/token-estimation.mdx \
        apps/web/src/content/docs/configuration.mdx
git commit -m "docs(web): rewrite reference pages against current workbench"
```

---

## Chunk 5: Sources pages

### Task 5.1: `github-import.mdx` (~500 words)

**Files:**
- Modify: `apps/web/src/content/docs/github-import.mdx`

**Anchors:**
- `packages/core/src/sources/adapters/github.ts` — URL parsing
  (`parseUrl`), the supported shapes, the rate-limit messaging.
- `packages/core/src/sources/adapters/gist.ts` — gist URL shapes.
- `packages/core/src/sources/adapters/_errors.ts` —
  `classifyResponseError` so the error wording matches.
- `packages/core/src/sources/adapters/url.ts` — the fallback note.

**Required content:**

1. **URL shapes** (enumerated from `github.ts`):
   - `https://github.com/<owner>/<repo>`
   - `https://github.com/<owner>/<repo>/tree/<branch>`
   - `https://github.com/<owner>/<repo>/tree/<branch>/<subPath>`
   Subpath imports limit the tree to that directory.
2. **Rate limits**: unauthenticated github API allows 60 requests/hour
   per IP. One repo fetch typically consumes several. 401/403/429 errors
   surface with a human-readable message (the classifier handles this).
3. **Gist sub-section** (H2 `## Gist`):
   - URL shapes from `gist.ts`:
     `https://gist.github.com/<user>/<gistId>`,
     `https://gist.github.com/<gistId>`.
   - Same flow; gist files are flat (no subdirectories).
4. **URL fallback note** (short paragraph or H2):
   Anything not recognised as a known host is downloaded as a raw
   single file by the URL fallback adapter. State this once in the
   Sources area; pick this page as the home.
5. Cross-links: `/docs/file-filtering`, `/docs/token-estimation`.

### Task 5.2: `gitlab-import.mdx` (~350 words)

**Files:**
- Modify: `apps/web/src/content/docs/gitlab-import.mdx`

**Anchors:** `packages/core/src/sources/adapters/gitlab.ts`.

**Required content:**

- URL shapes from `gitlab.ts`:
  `https://gitlab.com/<owner>/<repo>`,
  `https://gitlab.com/<owner>/<repo>/-/tree/<branch>`,
  `https://gitlab.com/<owner>/<repo>/-/tree/<branch>/<subPath>`.
- gitlab.com only; self-hosted instances are not supported today.
- 401/403/429 surface via the classifier.
- **Do not mention a token input.** PAT support is not shipped. If
  the page from the previous draft has the "Private repositories
  require a token" line, that line is being deleted on purpose.

### Task 5.3: `bitbucket-import.mdx` full content (~350 words)

**Files:**
- Modify: `apps/web/src/content/docs/bitbucket-import.mdx`

**Anchors:** `packages/core/src/sources/adapters/bitbucket.ts`.

**Required content:**

- URL shapes — read `bitbucket.ts`'s `parseUrl` and enumerate exactly
  what it accepts. Likely:
  `https://bitbucket.org/<workspace>/<repo>`,
  `https://bitbucket.org/<workspace>/<repo>/src/<branch>/<subPath>`.
  Verify before writing.
- bitbucket.org cloud only (no Server / Data Center).
- 401/403/429 surface via the classifier.

### Task 5.4: Verify + commit Chunk 5

- [ ] Run the same internal-link grep as Chunk 4 for these three files.
- [ ] **`pnpm check && pnpm lint` clean.**
- [ ] **Commit:**

```bash
git add apps/web/src/content/docs/github-import.mdx \
        apps/web/src/content/docs/gitlab-import.mdx \
        apps/web/src/content/docs/bitbucket-import.mdx
git commit -m "docs(web): rewrite source-import pages against current adapters"
```

---

## Chunk 6: Getting started + CLI

### Task 6.1: `introduction.mdx` (~350 words)

**Files:**
- Modify: `apps/web/src/content/docs/introduction.mdx`

**Anchors:**
- `apps/web/src/routes/index.tsx` and `apps/web/src/components/landing/`
  — for what fileconcat is from the user's vantage.
- `packages/cli/package.json` — npm name + install instruction.

**Required content:**

- One paragraph: what FileConcat is (privacy-first file concatenator)
  and what it outputs (single LLM-ready blob, XML or markdown).
- All processing is client-side; files never leave the browser.
- Two entry points: the web at fileconcat.com, the CLI
  (`pnpm add -g fileconcat`).
- Supported sources (plain inline list, no card grid):
  local drag-and-drop, github repos, github gists, gitlab repos,
  bitbucket repos, URL fallback.
- Three cross-links: `/docs/quick-start`, `/docs/file-filtering`,
  `/docs/token-estimation`.

**Cuts vs the current intro:** drop the "Smart Token Estimation"
marketing phrasing; drop the "Multiple Input Sources" sub-header
(replace with the inline list); drop the trailing "Getting Started"
numbered list (the quick-start link already does that work).

### Task 6.2: `quick-start.mdx` (~400 words)

**Files:**
- Modify: `apps/web/src/content/docs/quick-start.mdx`

**Anchors:**
- `apps/web/src/components/landing/hero.tsx` — drop flow on landing.
- `apps/web/src/components/source-input.tsx` — URL input + button
  label.
- `apps/web/src/app.tsx` — ActionBar Copy + Download buttons.

**Required content (two paths, both should work as written instructions):**

1. **Local files path:**
   - Drag a folder onto the landing dropzone (or use the workbench
     dropzone post-import).
   - The tree renders; toggle individual files via checkbox.
   - Click **Copy** or **Download** in the bottom ActionBar.

2. **Remote source path:**
   - Paste a github / gitlab / bitbucket / gist / URL into the
     SourceBar input.
   - Press Enter or click the import button (use the exact label from
     `source-input.tsx`).
   - Tree renders; same Copy / Download flow.

3. **Optional tweaks** (one short paragraph each):
   - Filter rail include / ignore patterns + preset chips.
   - ActionBar Options popover for output format + single/multi.

**Cuts vs the current quick-start:** drop "Settings panel" entirely
(it does not exist); fix the "Fetch Files" name to whatever the source
input button actually says; drop "Save your most common patterns as
presets" (presets are baked, not user-saveable).

### Task 6.3: `cli-usage.mdx` (~450 words)

**Files:**
- Modify: `apps/web/src/content/docs/cli-usage.mdx`

**Anchors:**
- `packages/cli/src/index.ts` — Commander flag declarations.
- `packages/cli/src/commands/concat.ts` — defaults + behaviour.
- `packages/cli/src/config.ts` — `FileConcatConfig` shape.
- `packages/cli/package.json` — published name + version.

**Required content:**

1. **Install** — `pnpm add -g fileconcat` or `npx fileconcat`.
2. **Default command vs explicit `concat`** — both share the same
   flag set (one sentence).
3. **Flag table** — markdown table with these columns:
   `flag | short | default | notes`. Rows must match `index.ts` exactly:

   | flag | short | default | notes |
   | --- | --- | --- | --- |
   | `[path]` | — | `.` | positional argument |
   | `--output <file>` | `-o` | `output.xml` / `output.md` | by style |
   | `--max-size <mb>` | `-m` | `32` | per-file cap |
   | `--no-hidden` | — | excluded by default | flip to include |
   | `--no-binary` | — | excluded by default | flip to include |
   | `--exclude <patterns…>` | `-e` | — | repeatable glob list |
   | `--config <file>` | `-c` | — | json/yaml config |
   | `--style <style>` | `-s` | `xml` | `xml` \| `markdown` \| `md` |

4. **Config file** — show the minimal `FileConcatConfig` example
   (one fenced JSON block, no more). Point at `config.ts` for the
   full type.
5. **One worked example** — keep it simple:

   ```bash
   fileconcat ./src --include "**/*.ts" --ignore "**/*.test.ts" --style markdown
   ```

   Wait — the CLI has `--exclude` but not `--include`. **Verify
   against `index.ts` before writing the example.** Use only flags
   that exist.

6. Cross-link to `/docs/file-filtering` for the same pattern
   semantics shared with the web app.

### Task 6.4: Verify + commit Chunk 6

- [ ] Internal link grep across the three files.
- [ ] `pnpm check && pnpm lint` clean.
- [ ] **Commit:**

```bash
git add apps/web/src/content/docs/introduction.mdx \
        apps/web/src/content/docs/quick-start.mdx \
        apps/web/src/content/docs/cli-usage.mdx
git commit -m "docs(web): rewrite getting-started pages and CLI reference"
```

---

## Chunk 7: Final verification

### Task 7.1: Full type-check + lint

- [ ] **Step 7.1.1: `pnpm check`**

```bash
pnpm check
```

Expected: 2/2 packages clean.

- [ ] **Step 7.1.2: `pnpm lint`**

```bash
pnpm lint
```

Expected: 0 errors; the one pre-existing react-refresh warning in
`staged-files-provider.tsx` is allowed (see NEXT_STEPS notes).

### Task 7.2: Dev server click-through

- [ ] **Step 7.2.1: Start dev**

```bash
pnpm dev
```

Wait for the server to come up.

- [ ] **Step 7.2.2: Visit every page**

Open each URL and confirm it renders (no 404, no blank screen, no
client-console errors). Browser DevTools console must stay clean.

- `/docs`
- `/docs/quick-start`
- `/docs/github-import`
- `/docs/gitlab-import`
- `/docs/bitbucket-import`
- `/docs/file-filtering`
- `/docs/filter-precedence`
- `/docs/token-estimation`
- `/docs/token-costs`
- `/docs/configuration`
- `/docs/cli-usage`

- [ ] **Step 7.2.3: Sidebar visual check**

Confirm the sidebar shows three sections (Getting started / Sources /
Reference) and the active-page dot lands on whichever page is open.

### Task 7.3: Full internal-link grep

- [ ] **Step 7.3.1: Extract every internal link from every MDX file
  and confirm each target exists.**

```bash
LINKS=$(grep -hoE "/docs/[a-z-]*" apps/web/src/content/docs/*.mdx | sort -u)
for link in $LINKS; do
  slug="${link#/docs/}"
  if [ -z "$slug" ]; then
    # /docs itself = introduction
    continue
  fi
  if [ ! -f "apps/web/src/content/docs/$slug.mdx" ]; then
    echo "MISSING: $link"
  fi
done
```

Expected: no `MISSING:` lines.

### Task 7.4: Em-dash audit

- [ ] **Step 7.4.1: Confirm zero em-dashes in MDX (brand ban).**

```bash
grep -n "—" apps/web/src/content/docs/*.mdx
```

Expected: no output. If anything matches, replace with a regular
`-` or restructure the sentence.

### Task 7.5: Sitemap regenerate (optional smoke)

- [ ] **Step 7.5.1: Run prebuild**

```bash
cd apps/web && pnpm generate-sitemap
```

Confirm `apps/web/public/sitemap.xml` lists all 11 doc URLs. If the
generator does not scan MDX, the new slugs will be missing. That is a
Tier 1 #3 follow-up; flag it but do not block this chunk.

### Task 7.6: No commit for Chunk 7

Verification only. Any fixes triggered by the audit get their own
commit in the relevant chunk.

---

## Risks called out in the spec (carry forward)

- **Docs rot** if PAT input (NEXT_STEPS Tier 3 #8) ships shortly
  after this revamp. Mitigation: PAT page changes are one paragraph
  per affected source page; cheap to amend.
- **Fact-check fatigue.** The discipline above is non-negotiable. If
  during implementation a fact cannot be confirmed against the
  current source, stop and surface — do not guess.

## Done definition

Plan is complete when:

- Sidebar shows three sections with 11 entries.
- All 11 MDX files exist with full content (no stubs remaining).
- `pnpm check` + `pnpm lint` clean.
- Every internal `/docs/<slug>` link resolves.
- No em-dashes in any MDX file.
- All 11 routes render in a local dev server with no console errors.
- Each chunk has its own commit.
