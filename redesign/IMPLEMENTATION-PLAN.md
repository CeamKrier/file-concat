# FileConcat Redesign — Implementation Plan

Grounded in the handoff (`redesign/README.md`), the current `apps/web` codebase, and `packages/core`.
This plan recreates the prototype designs in the existing stack (React 18 + TS, Vite, Tailwind, shadcn/ui, tiktoken) — it does **not** port the `.dc.html` prototype or `support.js`.

---

## PROGRESS (2026-07-01) — ALL PHASES DONE (0–8); redesign complete

Branch: **development** (caught up to master). All work below verified with the screenshot loop (typecheck green, eslint clean).

**Done:**
- **Phase 0 (foundation):** warm-dark dark-only theme + fonts. `apps/web/src/styles/app.css` (CRLF file — run prettier after Write), `tailwind.config.js` (new color tokens `surface/ink/go/info/neutral-info/code/border-strong/hairline`, radii `input/chip/card/panel/pill`, z-scale `dropdown..tooltip`, `float`/`fade-up` keyframes), `__root.tsx` (`<html class="dark">` hardcoded, ThemeProvider + anti-flash script removed, Space Grotesk + Hanken Grotesk + JetBrains Mono link). Deleted `theme-provider.tsx`, `theme-toggle.tsx`. Space Grotesk waived in `.impeccable/config.json`.
- **Phases 1 + 2 (spine + happy path):** new `apps/web/src/components/app/` — `app-flow.tsx` (orchestrator owning `useConfig`/`useFileIngestion`/`useFilterState`/`useOutputGeneration` + tiktoken; derives the `landing|processing|result` view; runs the processing narration for its full beat via `begin()` + step timers), `top-bar.tsx` (context-aware), `logo-mark.tsx` (CSS two-square logo), `landing-hero.tsx`, `drop-zone.tsx` (drives `ingestion.handleDrop`/`handleFileInput`), `processing-view.tsx`, `result-view.tsx` (stats readout + amber/blue `InfoCard`s + format segmented + preview), `result-empty.tsx`, `info-card.tsx` (3 tones), `segmented-control.tsx`. `routes/index.tsx` → `<AppFlow/>`; `routes/app.tsx` → redirect to `/`.
- **Phase 4 (settings drawer):** `ui/sheet.tsx` (Radix-Dialog right sheet) + `settings-drawer.tsx` (**controlled** — config/setConfig/filter come from app-flow; never call `useConfig` twice). Reuses `FileTree` (default export), `CostEstimate`, `ModelSelector`, `useModels`. `PATTERN_PRESETS` copied locally (filter-rail's copy is not exported).
- **Phase 8 (engine + cleanup):** (1) **Plain output format** — `OutputStyle` is now `xml | markdown | plain` (`output.ts` + `types.ts`); new `assemblePlain` (header + tree + `====`-ruled `FILE: path` blocks, verbatim, no markup); wired through `use-output-generation` (`.txt`/`text/plain` on download) and the result-view format segmented (XML / Markdown / Plain). 5 new vitest cases. (2) **Content-sniff binary detection** — `validation.ts` `isBinaryFile` now reads the first 8 KB and flags a NUL byte (`isBinaryContent`, exported + unit-tested); content wins, extension allowlist is the read-failure fallback (an `.ai` that is XML processes; a NUL-bearing `.txt` is skipped). (3) **Zip auto-unpack** — added `fflate`; new `~/lib/expand-zips.ts` runs inside `ingestBatch` (PK magic check → `unzipSync` → synthetic `File` per entry under a folder named for the archive, `__MACOSX`/`.DS_Store` dropped; remote fetches with content set are never treated as zips); `useFileIngestion` exposes `expandedZip`; app-flow shows the green "Unpacked the zip and combined everything inside." note. (4) **Cleanup** — deleted the retired `/app` editor + old import/marketing surface: `src/app.tsx`, `file-viewer-content`/`file-viewer-modal`, `lazy-editor-codemirror`, `use-file-editor`, `preview-modal`, `filter-rail`, `action-bar`, `token-section`, `repository-input`, `source-input`, `recent-sources-dropdown`, `download-progress`, `use-source-detection`, `use-recent-sources`, `use-paste-detection`, the whole `components/landing/`, and old `site-header`/`site-footer`. Removed the 10 `@codemirror`/`@uiw`/`@lezer` deps + the `codemirror` manualChunks entry. (KEPT `staged-files-provider` — still wrapped in `__root.tsx`; file-tree/cost-estimate/model-selector — used by the drawer.) Verified: 152 core tests pass, typecheck green, production build succeeds, and zip + content-sniff + Plain confirmed end-to-end (a dropped zip with a NUL-byte entry combined 3 text files and skipped the binary).
- **Phase 7 (docs reskin):** purely visual, docs stay multi-page (each MDX is its own route; sidebar active = current route, not in-page scrollspy). `docs-layout.tsx` rebuilt: new warm-dark sticky `DocsHeader` (LogoMark→`/`, green "Open the tool" button, GitHub, mobile menu toggle replacing the old FAB), centered `max-w-[1040px]` flex with a 212px sidebar (sticky desktop `top-[52px]` / off-canvas mobile + scrim) and a `max-w-[720px]` content column; swapped old `SiteHeader`/`SiteFooter` for the new `app/marketing` `SiteFooter`. `mdx-provider.tsx` retoned to warm tokens (body `ink-secondary`, headings `ink` + `scroll-mt-[80px]`, inline code `surface-inset` chip, `pre`/blockquote/table `surface-inset`/`surface-alt` + `hairline`, links keep green underline). `app.css` prism rewritten warm: green (`--go-text`) for keywords/tags/structure, amber (`--info`) for strings/literals/numbers, `--foreground` for function names, `--text-muted` punctuation, faint italic comments, `var(--font-mono)`. Verified desktop + mobile + a JSON block (green keys / amber values). NOTE: docs *copy* is stale (references the removed FilterRail / ActionBar) — a content rewrite is a separate follow-up, not part of this visual reskin.
- **Phase 6 (marketing reskin):** new `app/marketing/` — `section.tsx` (band wrapper: top hairline + tone `base|alt|cli` bg + 1040px inner), `labeled-points.tsx` (mono-label list, used by A & D, never as a section eyebrow), `output-section.tsx` (A: text + hand-tokenized warm-dark XML code window), `filtering-section.tsx` (B, `alt` band: centered head + Combined/Skipped contrast cards + 3 green pills + amber `InfoCard`), `privacy-section.tsx` (C: text + mock NETWORK panel ending in a green "you drop 40 files · nothing sent" row), `cli-section.tsx` (D, `cli` band #100d09: the ONE allowed blue eyebrow "Separate tool · command line", terminal block on `surface-cli` with copy button, PIPE/PARSE/JSON points, footnote), `cta-section.tsx` (E: centered, "Open the tool" scrolls to top respecting reduced-motion + "Read the docs"), `site-footer.tsx` (LogoMark + tagline + Open tool→`/`/Docs/GitHub/CLI-on-npm + MIT line + BMC). `index.tsx` exports `MarketingSections` (A–E) + `SiteFooter`; `app-flow` swapped its 5 old `landing/*` imports + old `site-footer` for these. CLI package confirmed `@fileconcat/cli` / bin `file-concat`. Verified desktop + mobile (390px) section-by-section.
- **Phase 5 (import panel):** new `~/lib/classify-url.ts` (`classifyUrl(raw, tab)` → `repo|gist|page|binary|bad|empty` + normalized url + `sourceType`/`hostName`/`slug`; host-first, shorthand resolves via active tab, detection is URL-driven so the caption is tab-independent). New `app/import-panel.tsx` (`ImportPanel` controlled + `ImportTrigger`; SegmentedControl source tabs, mono input + validity-lit Fetch, live caption, example chips from `SOURCE_METADATA`, friendly amber failure box, `role="region" aria-label="Import from a link"`). `app-flow.tsx`: import state lifted above the phase switch (survives the processing→landing round trip on a failed fetch), `begin(run, {steps,label})` now parametrized, `LOCAL_STEPS` + per-source `importNarration()` (repo/gist/page step lists + green result note), `friendlyFetchError()`, `runImport()` via `ingestion.ingestRepo`. `landing-hero.tsx` mounts trigger/panel via `importControls`. `result-view.tsx` gained `note` prop (green note chip). Verified end-to-end with a real `octocat/Hello-World` fetch.

**Verification infra:** `pnpm --filter @fileconcat/web shot` (`apps/web/scripts/shot.mjs`, playwright-core + cached chromium) with `--set-files`, `--wait-for`, `--click-text`, `--click`, `--fill`/`--fill-selector`, `--press`, `--selector`, `--full`. PNGs → `/tmp/fc-shots/`, then Read them. (Dev server may land on `:5174` if `:5173` is held by a stale server.)

**Redesign complete (Phases 0–8) + the three follow-ups are DONE:**
- **Docs copy rewritten** to the new UI across 10 MDX (cli-usage untouched but prettier-reformatted): "workbench"→the tool/page, "FilterRail"/"ActionBar Options popover"/"Advanced section"→the **Adjust what's included** drawer, "Source input"→the import panel; Format now XML/Markdown/**Plain** on the result screen; the dead "Show line numbers" toggle claim removed (engine supports it, no UI); "Recent sources" section dropped (feature gone). No em dashes, MDX compiles, pages render.
- **`staged-files-provider` removed** — unwrapped from `__root.tsx` and deleted (no remaining consumers).
- **Zip "Unpacking the zip" processing step** — `app-flow` detects a `.zip` synchronously from the dropped/selected FileList (`zipBeginOptions`) and gives `begin()` the `ZIP_STEPS` narration + a `"<name> (zip)"` label. Verified mid-flight.
- Also cleaned the stale `optimizeDeps.include` (codemirror/lezer) from `vite.config.ts` (dev resolve-error warnings, gone).

**Genuinely remaining (real findings surfaced during the docs pass, all small + separate):**
- **`maxFileSizeMB` is not wired to ingestion.** `use-config` defaults it to 32, but `app-flow` passes core `DEFAULT_CONFIG` (10) to `useFileIngestion`, so the user's size setting never applies and the effective cap is a hardcoded 10 MB. The drawer has no size control either. Decide the intended cap, then either pass the live config to ingestion or drop the setting + fix the docs (docs currently still say "32").
- **Surfaced-vs-config gaps:** `exportConfig`/`importConfig`, `defaultSourceType`, `autoSwitchSource` still exist in `use-config` but nothing in the redesigned UI renders them. Either resurface or retire.
- **Big-bundle threshold** is `MULTI_OUTPUT_LIMIT = 100_000` tokens; docs now describe it qualitatively (the old "200K" was wrong). Decide whether to document the number.

---

## 0. The framing that drives everything

The redesign is **not** a feature expansion. It is a **collapse + simplify**:

| | Today | Redesign target |
|---|---|---|
| Surfaces | `/` (marketing + hero) **and** `/app` (3-pane editor) | **One** state machine on `/`: `landing → processing → result` + drawer |
| Power UI | Always-on: `FilterRail │ FileTree │ ActionBar` + per-file CodeMirror | Tucked into a right-side **"Adjust what's included"** drawer; opt-in |
| First run | Drop → land in a busy editor | Drop → **straight to processing**, zero questions, then a centered result |
| Theme | OKLCH moss-green, light-default + dark toggle | Fixed **warm near-black dark** (hex tokens) |
| Fonts | Mona Sans + JetBrains Mono | Space Grotesk + Hanken Grotesk + JetBrains Mono |

So the work is mostly **reskin + rewire existing logic into a simpler shell**, plus two genuinely new engine pieces (zip, content-sniff) and several new *states* (processing narration, empty-rescue, info cards).

**Decisions (locked):**
- **D1 — Theme scope: DARK-ONLY.** Match the handoff exactly. Remove the light theme, `theme-toggle`, and the anti-flash script. (Knowingly diverges from PRODUCT.md's "tested in both themes" — PRODUCT.md should be updated to reflect a single warm-dark theme.)
- **D2 — `/app` editor: FULL REPLACE.** `/` becomes the single-page state machine; `/app` folds in and redirects to `/`. Per-file CodeMirror editing is **dropped** to match the simpler design. This retires `file-viewer-content.tsx`, `file-viewer-modal.tsx`, `lazy-editor-codemirror.tsx`, `use-file-editor.ts`, and `preview-modal.tsx` (result preview becomes an inline `<details>`), and lets the CodeMirror `manualChunks` split + `@codemirror/*` deps be dropped — a real bundle win.

---

## 1. Design foundation (tokens · fonts · theme)

**Files:** `apps/web/src/styles/app.css`, `apps/web/src/routes/__root.tsx`, `tailwind.config.js`

1. **Replace the color system.** Today's `:root`/`.dark` use OKLCH moss-green. Introduce the handoff's warm-dark palette as CSS custom properties. Keep the shadcn token *names* (`--background`, `--foreground`, `--card`, `--border`, `--primary`, `--primary-foreground`, `--muted-foreground`, `--ring`…) so installed primitives keep working, and map handoff hex → those tokens:
   - `--background: #16130f`; radial top glow `#211b13 → #16130f` (a fixed background layer, not a token).
   - `--card: #1c1812`; alt panel/drawer `#191510`/`#1a1610`; inset `#120f0a`; CLI block `#0a0806`.
   - `--border: #2c261d` (default) / `#342d22`–`#3a3329` (stronger); hairline `#221d16`.
   - text: primary `#f1ebe0`, secondary `#b3a994`, muted `#8d8472`, faint `#6f675a`/`#5f5849`.
   - `--primary: #7acd8e` with `--primary-foreground: #11261a`.
2. **Add semantic accent tokens** beyond shadcn defaults — these carry the brand's "quiet by default, expressive on intent" rule:
   - `--accent-go` (green `#7acd8e`, + tints `rgba(122,205,142,.08–.14)`, border `.2–.4`, text `#9fdcb0`).
   - `--accent-info` (amber `#e3b96a`, tint `rgba(217,168,90,.07–.2)`) — **heads-up, never alarm**.
   - `--accent-neutral` (blue `#79a6d8`/`#90b6e2`, tint `rgba(121,166,216,.07–.26)`) — optional info + CLI context.
   - Semantics: **green = go/success/primary · amber = informational heads-up · blue = neutral/optional + CLI**.
3. **Radii scale:** inputs/buttons `9–10px`; cards `13–14px`; large panels/drop zone `16–20px`; chips `6–9px`; full pills `999px`. Today's `--radius: 0.5rem` becomes a small family of radius tokens.
4. **Fonts.** Swap the Google Fonts link in `__root.tsx`: drop Mona Sans, add **Space Grotesk** (600/700, headings/UI accents, tracking `-.02em`/`-.025em`), **Hanken Grotesk** (400/500/600/700, body/UI), keep **JetBrains Mono** (400/500/600, code/paths/labels/eyebrows). Update `--font-display`/`--font-body`/`--font-mono`. Drop the Mona-Sans `font-feature-settings` (`ss01`/`cv11`).
   - *Note:* Space Grotesk sits on impeccable's reflex-reject list, but the owner specified it as an intentional high-fidelity token — identity-preservation wins; honor it.
5. **Type scale tokens:** Hero H1 46/1.04/700; section H2 32/700 (docs H2 24); result H2 30/700; final CTA 38; lead 16–17/1.5–1.6; body 13.5–15; meta 12–13; mono labels 10.5–12. Use `clamp()` for the hero/CTA so headings don't overflow on tablet/mobile (impeccable: viewport is part of the design).

**D1 (dark-only) lands here:** hardcode the warm-dark values on `:root`, delete `theme-provider.tsx`/`theme-toggle.tsx` and their usages, and remove the `__root.tsx` anti-flash script. Update PRODUCT.md's "tested in both themes" line to a single warm-dark theme.

---

## 2. Primitive & structure prep

**Install missing shadcn primitives:** `Sheet` (the settings drawer + mobile import), `Textarea` (ignore/include globs). `Select` — a custom `model-selector.tsx` already exists; reuse it rather than adding shadcn Select.

**Build small shared pieces** (no good primitive exists):
- `SegmentedControl` — used by the format toggle (XML/Markdown/Plain) and import source tabs (GitHub/GitLab/Bitbucket/Gist/URL). Can wrap shadcn `Tabs` or be a small custom component; active fill `#221d16`.
- `Eyebrow` — JetBrains Mono 10.5–11px, tracking `.12–.16em`, uppercase, `#6f675a`/green-muted `#7c9c86`. **Use sparingly** (see §8).
- `InfoCard` — one component, three tones (`go`/`info`/`neutral`) for the amber heads-up, blue big-bundle, and green note chips. Full borders + tint bg, **no side-stripe**.
- `StatusPill`, `NoteChip`, `LogoMark` (the two-square CSS logo).

**Reorganize** app components under `apps/web/src/components/app/` (processing-view, result-view, settings-drawer, import-panel) to break up the 700-line `app.tsx`.

---

## 3. The state machine (the spine)

**New:** `apps/web/src/components/app/use-app-flow.ts` (or a small store) owning the view state. It **orchestrates existing hooks**, it does not replace them.

Prototype state → implementation:
- `view: 'landing' | 'processing' | 'result'` — new top-level state.
- source descriptor + derived result (`source`, `includedCount`, `totalFiles`, `skippedNoise`, `tokens`, `unsupportedList`, `note`, `bigBundle`) — derived from `useFileIngestion()` + `@fileconcat/core` processing + `useModels()`/tiktoken.
- `format: 'xml'|'md'|'txt'`, `splitMode` — extend `useConfig()`/`useOutputGeneration()`.
- `settingsOpen`, `activePreset`, `includeText`, `ignoreText`, `excluded` — map to `useFilterState()` + `useConfig()`.
- `stepIndex` (processing %/checklist), import state (`importOpen`, `importTab`, `urlText`, `urlWarning`, classification), UI (`isDragging`, `copied`), docs `activeId` — new local state in the owning views.

**Reuse, don't rebuild:** `useFileIngestion`, `useFilterState`, `useOutputGeneration`, `useConfig`, `useModels`, `useSourceDetection`, `useRecentSources`, `staged-files-provider`. The redesign changes the *shell and choreography*, not the processing core.

---

## 4. Screen-by-screen build (reuse vs. new)

> `/` becomes the single-page state machine; `/app` redirects to `/` (D2: full replace). `/docs` stays a route.

| # | Screen | Status | Source / target |
|---|---|---|---|
| Top bar | Sticky blur bar, CSS logo = "start over", context-aware right side | **Reskin** | `site-header.tsx` |
| 1 | Landing hero + drop zone (status pill, H1/subhead, dashed drop zone, browse files/folder, "what gets combined" row, samples, import link) | **Rebuild** | `landing/hero.tsx` + `source-input.tsx` logic. **Drop/browse → processing immediately, no questions** (the #1 requirement). |
| 2 | Marketing A–E + footer (what you get back, "not sure what to drop", private-by-design network mock, CLI band, final CTA) | **Rebuild** | `landing/marketing-folds.tsx`, `output-preview.tsx`, `cli-fold.tsx`, `closing-fold.tsx`, `site-footer.tsx`. Hidden during processing/result. |
| 3 | Processing (72px spinner + live %, step title + source label, friendly step checklist with filling dots) | **New** | New `app/processing-view.tsx`. Step copy varies by source (folder/zip/repo/page). ~560ms/step cadence. |
| 4 | Result — success (green ✓, "Your file's ready", source chip, note chip, 3 summary stats, big Copy + Download, format segmented + live preview, amber heads-up card, blue big-bundle card, `<details>` preview) | **Rebuild around existing** | `action-bar.tsx` (copy/download), `token-section.tsx` (tokens), format from `useOutputGeneration`. Stats rendered as an **inline readout, not 3 metric cards** (avoid the hero-metric/SaaS cliché). |
| 5 | Result — empty / wrong-input rescue (`includedCount === 0`: "these look like images, not text", dropped-files chips, "try a folder of files instead") | **New** | New `app/result-empty.tsx`. **No dead ends** — always offer a next step. |
| 6 | Import panel (progressive; source tabs, mono URL input, Fetch with live validity, live caption validation, example chips, friendly amber failure box) | **Reskin over existing engine** | `repository-input.tsx` + `useSourceDetection` + core adapters. Reimplement `classifyUrl` → `repo\|gist\|page\|binary\|bad\|empty`. |
| 7 | Settings drawer — "Adjust what's included" (Sheet 420px, presets chips, ignore/include textareas, file tree w/ checkboxes + dimmed auto-skips, cost estimate + model select, CLI-is-separate footnote) | **Consolidate into a Sheet** | `filter-rail.tsx` + `file-tree/*` + `cost-estimate.tsx`/`model-selector.tsx`. Everything updates the bundle **live**. |
| 8 | Docs page (sticky scrollspy sidebar 212px, MDX content, CLI section with blue eyebrow) | **Reskin** | `docs-layout.tsx` (keep scrollspy) + `content/docs/*.mdx` reskinned to new tokens. |

---

## 5. Engine / deferred work (grounded in `packages/core`)

| Item | Reality today | Work |
|---|---|---|
| **URL / repo / Gist / page ingest** | Adapters **exist** in `core/sources/adapters/` (github, gitlab, bitbucket, gist, url) with fetch logic; `repository-input.tsx` wired in web | **Mostly reskin.** Verify in-browser CORS paths + web-page readable-text extraction quality; wire to the new Import panel. |
| **Zip auto-unpack** | Not supported — `.zip` only appears in `binary-extensions.ts` (i.e. skipped) | **New.** Add an unzip lib (e.g. JSZip/fflate), expand client-side, feed entries into the same pipeline. UI feedback (unpack step + note chip) is already designed. |
| **Content-based text/binary detection** | Extension allowlist (`binary-extensions.ts`) + `validation.ts` | **New, bounded.** Sniff content (NUL bytes / UTF-8 decode) so an oddly-named-but-text file (e.g. XML `.ai`) is processed; only skip true binaries; surface what/why in the heads-up card. Augment `validation.ts`, keep it the single source of truth. |
| **Image concat** | n/a | **Out of scope.** Don't advertise as a sample or supported input; rescue state handles image-only drops. |
| **CLI separation** | `packages/cli` already separate | **Maintain** in code and copy. Marketing CLI band + docs CLI section must read as a *separate tool* (blue eyebrow, "not needed for the browser app"). |

---

## 6. Sequencing (phases with checkpoints)

0. **Decisions + foundation** — resolve D1/D2; land tokens, fonts, theme, radius scale (§1). *Checkpoint: existing pages still render, just re-themed.*
1. **Spine** — state machine + reskinned top bar shell (§2–3).
2. **Happy path** — landing hero + drop → processing → result success, reusing the engine end-to-end (screens 1, 3, 4).
3. **Feedback states** — empty/rescue, amber heads-up, blue big-bundle, format toggle + preview (screens 4 detail, 5).
4. **Drawer** — consolidate filters + tree + cost into the Sheet (screen 7).
5. **Import** — reskin over adapters + `classifyUrl` (screen 6).
6. **Marketing + footer** — sections A–E (screen 2).
7. **Docs reskin** — tokens + scrollspy intact (screen 8).
8. **Engine + polish** — zip unpack, content-sniff detection; a11y/contrast pass, `prefers-reduced-motion` on every animation, keyboard-complete flows, both-theme contrast (if D1 keeps light).

Each phase verified in-browser (impeccable: screenshot real states, not the prototype).

---

## 7. Motion

- Spinner 0.8s linear; drop-icon float 3.4s ease-in-out (±6px); processing ~560ms/step, ~460ms pre-result pause; copied/hover 0.15–0.18s.
- **Do not gate first paint on entrance animations** (the prototype's `opacity:0`-stuck bug). Animate real state changes via Tailwind transitions.
- Every animation needs a `prefers-reduced-motion: reduce` alternative (crossfade/instant).

---

## 8. Guardrails — reconciling the handoff with the established brand bans

The handoff and the project's standing brand rules (PRODUCT.md anti-references + recorded brand bans) conflict in a few spots. Police toward the brand:

- **Em dashes:** the handoff *copy* is full of them ("…Gemini — no setup"); the brand ban says avoid em dashes. **Rewrite copy** to drop them (periods/commas) unless the owner overrides.
- **Eyebrows on every section:** PRODUCT.md anti-references already ban the tracked-uppercase eyebrow; the handoff reintroduces an eyebrow pattern. **Use eyebrows sparingly** (e.g. only the CLI band's "separate tool" kicker), not above every section.
- **3 summary stat cards / 3 docs step cards:** keep them from collapsing into the hero-metric template / identical-card-grid. Prefer an inline stat readout and differentiated step cards.
- **Side-stripe borders:** the docs active-nav item specifies a 2px green left-border. Acceptable as a *nav active indicator* (not a card/callout accent), but if it reads as a stripe, switch to a filled/weight active state. All info cards use **full borders + tint**, never side-stripes.
- **Privacy by behavior, not badges:** the network-panel mock and "0 outbound requests" are the trust signal — keep trust shown, not asserted.

WCAG AA floor throughout: body ≥4.5:1, large ≥3:1, placeholder held to body bar; visible focus on every control; color never the only signal (icon/label on every status).

---

## 9. Decisions — resolved

- **D1 — theme: dark-only.** Warm-dark only; light theme + toggle removed.
- **D2 — `/app` editor: full replace.** New simple flow on `/`; `/app` redirects; per-file CodeMirror editing retired (see §0 for the files this removes).

Both are locked. Next concrete step when we start building: **Phase 0** — land the dark token set + fonts in `app.css`/`__root.tsx`/`tailwind.config.js` and confirm existing pages still render re-themed before touching structure.
