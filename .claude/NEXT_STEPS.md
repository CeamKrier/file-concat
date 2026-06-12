# Next steps — refreshed 2026-06-12 (post landing-rebrand series)

Snapshot: branch `development`, HEAD `ced010a`. CLI `@fileconcat/cli`
v0.1.0 live on npm. Landing carries Hero → OutputPreview → Audience
(prose) → CLIFold → PrivacyFold → ClosingFold → Footer; site-level
JSON-LD now ships three schemas. 61 commits ahead of `origin/development`.

Items ordered by projected marginal benefit. Each carries enough shape
for a cold session to brief from.

---

## Completed this turn (do not redo)

### Landing rebrand series (5 commits)

- `2f09944` — Cleanup tier: `generate-llms-txt.ts` template now uses
  `@fileconcat/cli` + bin `file-concat`, llms.txt + llms-full.txt regen
  to propagate; PrivacyFold body + NetworkPanel pill drop two em dashes
  (brand register fix); CLAUDE.md route list drops the removed
  `about.tsx`.
- `7c1c6be` — Hero subhead rewrite: "One paste-ready file..." trust-chip
  echo replaced with a concrete preview of the artifact ("Project tree
  at the top, every file in a labeled block. The model gets the
  structure before any file body."). Sets up OutputPreview fold.
- `29e0f51` — ClosingFold (new component
  `apps/web/src/components/landing/closing-fold.tsx`). Sits between
  PrivacyFold and the SiteFooter. One centered headline + asymmetric
  1.4fr/1fr grid (primary `Open the tool` button + real
  clipboard-copy install snippet with `Then: file-concat ./your-folder`
  caption). No new claims; picks up the user at peak conviction.
- `2da8e60` — Audience fold rewritten from a 4-up persona grid to a
  prose moment ("When you reach for it." + universal-moment paragraph
  + muted audience list inline). Grid harmonised with OutputPreview +
  CLIFold (`lg:col-span-5` / `lg:col-span-7`). `AudienceItem` helper
  removed.
- `4c75223` — Footer npm link. SiNpm icon next to SiGithub; nav switches
  from grid to flex-wrap so the four short items lay out cleanly.

### Quality + SEO follow-ups (2 commits)

- `6488090` — CLIFold + OutputPreview grid columns get `min-w-0` so
  unbreakable mono lines (terminal JSON, long imports) no longer pull
  the grid column wider than the viewport; mobile heading clipping
  fixed at 390px. `documentScrollWidth === innerWidth` now.
- `ced010a` — JSON-LD refresh: WebApplication description and
  featureList rewritten to match the current voice and surfaces; new
  SoftwareApplication schema for `@fileconcat/cli` (downloadUrl,
  codeRepository, softwareHelp pointing at /docs/cli-usage); HowTo
  steps now name GitHub + GitLab + Bitbucket and drop the "edit"
  claim. Broken `screenshot.png` reference removed. `__root.tsx`
  emits all three schemas.

---

## Tier 1 status

All four originally-scoped items closed: #1 ClosingFold shipped, #2
Hero subhead shipped, #3 Audience reshape shipped, #4 Motion pass
explicitly skipped (user decision). Tier 1 is empty.

---

## Tier 2 — Landing bets still on the table

### 1. Versus fold (vs repomix / gitingest / code2prompt)

**Why:** The adjacent slot is occupied by repomix, gitingest,
code2prompt, github2file. A visitor landing through search may be
comparing; we currently say nothing about why this tool not those.

**Concrete:**

- Avoid a feature-matrix table (brand-banal). Try a three-line shape:
  "(noun) does X. (other noun) does Y. FileConcat does Z." with one
  underline differentiator per competitor.
- Honest framing — repomix is a great CLI; the fold is about the
  surface shape (browser-first, no-account, same-engine on both
  surfaces).
- One inline link to repomix as honest acknowledgement.

**Effort:** 4-6h with brainstorming + impeccable invoke + copy.

**Risk:** Easy to ship as either smug or vague. Wants specificity.

### 2. Anchor-nav side rail on the long landing scroll

**Why:** Landing is now 6 folds. Re-finding the Hero CTA or skipping
past the CLI fold becomes friction.

**Concrete:**

- Right-edge floating nav, mono-text, current section highlighted.
- Lives only on `lg+`; hidden on mobile.
- 6 stops: Hero / Output / Audience / CLI / Privacy / Close.

**Effort:** 3-4h.

**Risk:** Side rails are noise generators when used wrong. Wants
impeccable invoke on placement, not just shape.

### 3. Open Graph image regeneration

**Why:** `apps/web/public/opengraph.png` was rendered before the brand
rebrand and the CLI publish. It carries: a pink-hex pattern background
that appears nowhere in the brand; a green "100% Offline Processing"
badge shaped like a foil sticker; "Free File Combiner for AI |
ChatGPT, Claude & LLM Tool" as the tagline, which is listing-style SEO
copy in a brand whose voice is "considered, exact, quiet." When the
page is shared on Twitter, LinkedIn, Slack, Discord, this is what
people see first.

**Concrete:**

- 1200×630, brand white or near-black background, no decorative pattern.
- Current hero h1 as the headline ("Drop a folder. Get one file your
  AI can actually read.") or a tightened OG-specific version.
- Small footer line mentioning both surfaces ("fileconcat.com  ·
  @fileconcat/cli").
- Drop the "100%" badge entirely.

**Effort:** 1-2h in Figma + commit the new asset.

**Risk:** Low. Visual-only task.

---

## Tier 3 — Out of landing scope, parked

These remain ranked by projected benefit but live outside the current
landing focus.

- **Lossless compression measurement.** ~1h pre-flight (tokens.ts uses
  `o200k_base`, napkin's measurements are `cl100k_base` and not
  binding) + 3-5d full sweep. Default-OFF opt-in toggles in FilterRail
  Advanced. The `removeEmptyLines` mistake (measured +5.93%) makes
  this category radioactive without honest measurement.
- **/app rework.** Cost-estimation experience + tool UX narrowing +
  honest progress feedback on large ingestion. Multi-day, PRODUCT
  register. Real-user CLI feedback still not surfaced.
- **Tree-sitter skeleton mode.** 1-2w. Category shift to "context
  provider".
- **PWA + offline manifest.** ~1w. Service worker + manifest install
  path. Brand-aligned but not landing-leverage.
- **CLI v0.2 candidates** (`--schema`, `--json-progress`, `--watch`).
  Wait for real harness traffic. Over-fit risk.

---

## Nice-to-have backlog

- **CLI npm README → /docs/cli-usage cross-link.** ~15 min. So a
  visitor on either surface knows the other exists.
- **Lighthouse / axe pass on /docs and the landing.** Only /app has
  been audited (commit `830e891`). ~2-3h.
- **FileTree per-extension icons** (carry-over). Memorised as
  `project_filetree_icons_nice_to_have`.

---

## Suggested next session opener

Pick by what you have time for:

- **Smallest landing lift (1-2h, mostly visual):** Tier 2 #3, OG image
  regen. Low risk, high "share-quality" payoff. Best ratio.
- **Strategic content (4-6h):** Tier 2 #1, Versus fold. Highest
  brand-strategy risk and reward. Needs brainstorming.
- **Brand-cleanest pass (3-4h):** Tier 2 #2, anchor nav. Earns its
  place now that the page is 6 folds. Wants impeccable invoke twice
  (shape + placement).
- **Out of landing (varies):** Tier 3 picks. Compression measurement
  is the most defensible if landing is at a natural pause.

If picking up cold, Tier 2 #3 (OG image) first: it visibly mismatches
the rebrand and gets seen every time the page is shared. After that,
Tier 2 #1 (Versus fold) is the next biggest brand move.
