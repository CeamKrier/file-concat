# Metrics gaps - implementation handoff

Written 2026-08-27, for a cold session to pick up. Everything below was verified
against `master` at `3706b02` (PR #50 merged 2026-08-27 13:52 UTC, CI green,
Workers Builds shipped it). No part of this has been implemented yet.

Companion reading: `.claude/CLAUDE.md` for the workspace rules, the `pulse`
skill for how a counter is read afterwards, and `apps/web/src/lib/metric-events.ts`
which is the authority on every existing counter's semantics.

`.claude/NEXT_STEPS.md` is stale (2026-06-12) and is not a guide to the current
tree. Do not brief from it.

## The task in one sentence

Five gaps where the product produces a decision-changing outcome and writes no
row. Four need a new counter, one needs a query the pulse script is missing.

## What just shipped, and why the timing matters

PR #50 made the link-import row visible on the home landing. It used to hide
behind a "from a link" trigger. The counter comment in
`apps/web/src/components/app/import-panel.tsx` carries the measured before:
`source_used` recorded 4 Visits using a remote source in the 30 days to
2026-08-27, against 438 Visits that dropped files.

**The population that touches that field changed from 4 to 438 overnight**, and
the failure mode the new population will produce is the one with zero
instrumentation (A1 below). The first measurement window after this deploy can
therefore say whether usage moved, and cannot say why it did or did not. That
was a known, accepted trade at merge time. It is the reason A1 is first among
the new counters.

## Rules any new counter must satisfy

These are not style preferences. Each one has produced a wrong reading before.

1. **It changes a decision.** Two different values of the number must imply two
   different pieces of work. "Interesting" is not a reason.
2. **Its denominator is written down before the counter is.** A bare count is
   not a rate. Say in the doc comment what it divides by.
3. **It can clear the pulse gate.** >= 3 distinct Visits across >= 2 distinct
   days. A counter that structurally cannot reach that is noise.
4. **It aggregates per Run, never per click.** Otherwise the row count measures
   how much someone fidgeted, not what happened. Mirror the `emptiedRun` /
   `sizedRun` ref pattern already used for `empty_reason` and `bundle_size`.
5. **It carries no user data.** Not a file name outside the published marker
   list, not a URL, not the contents of a filter pattern. Record that an event
   happened and its kind, never its payload.

## A0. Teach pulse the `js_error` counter

**Cost:** one query. Do this first, it is free.

`metric-events.ts` defines 25 counters. Diffing that list against the names
`.claude/skills/pulse/pulse.mjs` queries leaves exactly one unread: `js_error`.
The pulse script derives the counters it touches from its own SQL and prints an
`UNREAD:` line for anything in the table it does not read, so this is already
being flagged on every run and has been ignored.

`js_error` is emitted at `apps/web/src/lib/js-errors.ts:100`, once per distinct
value per page load (not per throw), as `<source>/<kind>`. Read it as a Visit
count, which is what its comment says the useful number is.

Add the same names A1-A4 introduce to pulse's SQL **in the same commit that adds
them**, or the `UNREAD:` line fires again and the next reading is silently
incomplete about the newest work. That is exactly how `empty_reason`,
`ocr_offered`, `ocr_read` and `append_to` stayed invisible for days in August.

## A1. Import failures - `import_failed`

**Why.** Today the link path has exactly one counter, `source_used`, emitted at
`apps/web/src/hooks/use-file-ingestion.ts:823` at the **start** of `ingestRepo`,
before the first network round trip. So it counts attempts that reached the
network, and nothing records what happened next.

`apps/web/src/components/app/app-flow.tsx` has **zero** `track()` calls. Verified
by grep. Every import failure is invisible:

| site | condition | today |
|---|---|---|
| `app-flow.tsx:606` | `classifyUrl` returns `empty` or `bad` | nothing |
| `app-flow.tsx:610` | returns `binary` (a PDF/zip link) | nothing |
| `app-flow.tsx:628` | the `catch`, via `friendlyFetchError` | nothing |

The first two return before `ingestRepo` runs, so those attempts write no
`source_used` either. They are absent from the data entirely.

**Design.** One counter, three values: `bad` | `binary` | `fetch`. Emit at the
three sites above. No fourth counter is needed for the denominator:

- attempts = `source_used` rows + `import_failed` rows where value in (`bad`, `binary`)
- failures = all `import_failed` rows

`import_failed(fetch)` fires **after** `source_used` in the same Run, so that
Run appears in both terms and the arithmetic does not double count. Write this
in the doc comment; it is the only non-obvious part.

**Per-Run guard:** `runImport` is called once per Fetch press, and a person can
press Fetch repeatedly against the same bad link. Decide deliberately whether
that is one row or several, and say which in the comment. Recommendation: let
it write each press. Repeated presses against the same rejection are the signal,
not noise, and this is the one place where per-press is the honest unit.

## A2. Manual trimming in the file tree - `tree_edit`

**Why.** The only exclusion signal today is `empty_reason`, emitted at
`app-flow.tsx:418`, and it fires **only when the bundle came out completely
empty**. That is the rare terminal case. The common case, someone unchecking
some files and exporting the rest, writes nothing. So the most direct evidence
about whether `packages/core/src/.../default-ignore.ts` is right for real
folders is not being collected.

**This is nearly free.** `apps/web/src/hooks/use-filter-state.ts` already holds
`userToggled: Record<string, "include" | "exclude">` at line 40 and already
returns a computed `manualOverrideCount` at line 165. Nothing needs new
plumbing; the number exists.

**Design.**

1. In `use-filter-state.ts`, return the split alongside the existing count:
   `manualOverrides: { include: number; exclude: number }`, derived from
   `userToggled` in the same memo. Keep `manualOverrideCount` as it is, it has
   other callers.
2. In `app-flow.tsx`, add a `trimmedRun` ref effect **mirroring the `emptiedRun`
   effect at line 403-419**, but as its complement: fire on
   `phase === "result" && includedContents.length > 0`.
3. Emit `trackAmount("tree_edit", { value, n })` once per Run per non-zero side.
   Skip entirely when both are zero.

**Denominator:** Runs carrying a `bundle_size` row. Because the emit is skipped
at zero, the `tree_edit` row count is "Runs where someone trimmed", and that
over `bundle_size` Runs is the rate. State this in the comment.

## A3. Which model the token count targets - `model_picked`

**Why.** This is the product's positioning question, not an engineering one. The
home hero says "Hit the file limit on ChatGPT, Claude, or Gemini?" and there are
nine `/for` persona pages split across those vendors. Which one people actually
select is the most direct evidence for which persona page deserves the next
block of work. It is currently not recorded at all.

`apps/web/src/hooks/use-selected-model.ts` defaults to `models[0]` with no
persistence; `settings-drawer.tsx:270` passes `setSelectedModel` to the picker.

**Design.** Record **only a deliberate change**, the way `ocr_lang_changed`
does. Counting the default measures the default.

Record the **vendor**, not the model id (`openai` | `anthropic` | `google` | ...).
Two reasons: the positioning question is a vendor question, and model ids are
high cardinality against the tally cap while the catalogue refreshes from
`models.dev` on every build.

**Denominator:** Visits that reached the result phase. A change can only be made
from the settings drawer, which only exists after a bundle.

## A4. Filter edits - `filter_edited`

**Why.** Same family as A2 and a stronger, rarer signal: someone who **types a
pattern** is naming exactly where the defaults failed them.

Three sites in `settings-drawer.tsx`:

| line | what |
|---|---|
| `246` | `setConfig({ ignorePatterns: v })`, typed |
| `255` | `setConfig({ includePatterns: v })`, typed |
| `192-193` | a **preset** sets both at once |

The preset path is a different act from typing and should carry a different
value, or the two populations merge into one meaningless number.

**Design.** Values `ignore` | `include` | `preset`. Once per Run per value, not
per keystroke - these are `onChange` handlers on text inputs and a naive emit
would write a row per character. Debounce to the Run boundary using the same ref
pattern, or collect into a ref and flush in the A2 effect.

**Record that an edit happened, never what was typed.** A pattern is user data.

**Denominator:** Runs carrying a `bundle_size` row, same as A2.

## Sequence

| phase | work | note |
|---|---|---|
| 0 | A0, pulse reads `js_error` | free, no product change, do it first |
| 1 | A1 `import_failed` | the window is already running without it |
| 2 | A2 + A4 in one commit | same reasoning, same effect, adjacent code |
| 3 | A3 `model_picked` | independent, no rush |

## Explicitly out of scope

Each of these has a reason, not just an absence of time.

- **Why a Run was abandoned.** Structurally impossible for counters; the pulse
  skill says so directly. The instrument is a Clarity recording filtered to
  `fc_outcome = abandoned`, and what licenses a change is what you *saw* in it.
- **Output format (single vs multi).** `SPLIT_OUTPUT_ENABLED` is **false**
  (`packages/core/src/constants.ts:27`). There is nothing to measure yet. If it
  is ever flipped on, `bundle_size` records `n` and bytes but not which format
  produced them, so that flip needs a counter in the same change.
- **Whether the OCR offer was seen.** Known blind spot, documented on
  `ocr_offered` in `metric-events.ts`. An intersection-observer counter is a
  large change for a question Clarity already answers by recording.
- **Anything per click.** See rule 4.

## Traps

- **`metric-events.ts` is a two-sided change.** The array is shared by the
  browser client (`lib/metrics.ts`) and the server sink
  (`routes/api/e.ts`). A name added on one side and missing from the other is
  **silently dropped**, no error. The file's own header says this.
- **Add the new names to pulse's SQL in the same commit.** See A0.
- **ASCII only.** No em dash, curly quote, ellipsis character, arrow, middot or
  check mark anywhere, including comments and commit messages. Write `->`, `...`,
  a comma.
- **These files are stored CRLF.** `.prettierrc` says `endOfLine: "crlf"` and the
  repo is mixed. Detect the file's own endings before patching. **Never run
  `prettier --write`** - it rewrites whole files and the eslint-only lint in CI
  will not catch it.
- **Never `git add -A` after a build.** `prebuild` rewrites `sitemap.xml`,
  `llms.txt`, `llms-full.txt` and `models.json`. Leave them dirty, add by path.
- **A counter reading is local-only.** Never quote one into a public file, a
  commit message or a PR body. The two figures in this document (4 remote
  against 438 drops) are already committed in `import-panel.tsx` on `master`, so
  they are public by the owner's own choice; nothing else here should be.

## Verification

Per phase, before the commit:

1. `pnpm check`, `pnpm lint`, `pnpm test` from the root. All four projects.
2. Drive the path in a browser against `pnpm dev` and confirm a row lands.
   `routes/api/e.ts` is the sink; the network tab shows the beacon. A name the
   sink does not know returns fine and writes nothing, which is exactly the
   failure the two-sided trap describes, so **check the row, not the response**.
3. `node .claude/skills/pulse/pulse.mjs --days 30` and confirm the `UNREAD:`
   line does not name the counter you just added.
