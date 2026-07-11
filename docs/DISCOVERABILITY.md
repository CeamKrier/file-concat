# Discoverability audit + backlog

Findability / discoverability review of the web app. Snapshot taken on the
`development` branch, 2026-07-11.

**Success metric (decided):** organic search **clicks + CTR** ("authority" =
shrinking the gap between impressions and clicks), measured in **Google Search
Console**. Not GA4 on-site behaviour. See "Decisions" below for why.

## Strong today (keep, do not regress)

- **JSON-LD triple** emitted site-wide from `apps/web/src/routes/__root.tsx`:
  `WebApplication` + CLI `SoftwareApplication` + `HowTo`. Rare and strong.
- **`llms.txt` + `llms-full.txt`** in `public/` for LLM/GEO discovery. Early mover.
- Per-page OG / Twitter / canonical via `apps/web/src/lib/seo.ts`
  (`generateSEOMeta`), build-time `sitemap.xml` with git-derived `lastmod`,
  clean `robots.txt`, PWA manifest, security headers.
- **Persona SEO satellite pages** `/for/legal`, `/for/researchers` (ADR-0006),
  built to an explicit anti-thinness contract (not doorway pages).
- **Microsoft Clarity** for heatmaps / session replay. Qualitative on-site only;
  gives no search-performance data.

## Gaps, ranked by traffic potential

### 1. GSC data never drives decisions (highest leverage, gates everything)

Google Search Console is already set up and verified, so the raw
impressions/clicks/CTR/position/query data exists. The gap is that none of it
has ever driven a prioritization: Clarity measures on-site behaviour, not
search, and the GSC numbers have not been pulled into any analysis. We still
cannot say which queries impress-but-do-not-click (the CTR / authority gap the
project actually cares about) until that data flows into a review.

- **Fix:** get GSC Performance data into analysis (see "How we query GSC" below),
  then rank pages by the impression-to-click gap and fix the worst offenders.
- **Status:** GSC live; wiring the data into analysis now.

### 2. `/docs/$slug` templated meta (cheap, certain long-tail win)

`docs/$slug.tsx` derives the `<title>` from the slug (e.g. "Github Import -
FileConcat Docs") and hardcodes the description to "FileConcat documentation for
X." The MDX files already carry rich H1s and intros (visible in `llms.txt`) but
none of that reaches `<title>`/`<description>`. All 11 doc pages compete on
long-tail with weak, near-duplicate snippets.

- **Fix:** add `title` + `description` frontmatter to each `content/docs/*.mdx`,
  read it in `docs/$slug.tsx`, and feed it into `generateSEOMeta`.

### 3. No comparison / "alternative" / blog content (highest-intent tool SEO)

The highest-intent tool-search category is unclaimed: "repomix alternative",
"repo to text for ChatGPT", "code2prompt vs", "how to feed a codebase to Claude".
Competitors (Repomix, gitingest, code2prompt) hold these queries. No blog, no
changelog, zero top-of-funnel content.

- **Wanted:** blog infrastructure to widen the exposure surface. Candidate: an
  MDX-driven `/blog` route reusing the existing docs MDX pipeline.

### 4. Only 2 personas (gated on demand data from gap 1)

`writer` / `data` / `student` pages deferred by ADR-0006 until search demand
shows. GSC (gap 1) is the instrument that makes that demand visible; without it
the deferral has no trigger. Each new page must clear ADR-0006's four-part
anti-thinness contract.

### 5. Sitemap hygiene bug (one line)

`/app` now `redirect`s to `/` (`apps/web/src/routes/app.tsx`) but is still listed
in the sitemap at priority 0.9, `changefreq weekly`. A redirecting URL in the
sitemap is a soft error to Google. Remove the `/app` entry from
`apps/web/scripts/generate-sitemap.ts`.

## First GSC pull (2026-07-11, last 91 days)

Baseline from the Performance CSV export. Property already verified.

- **Totals:** 214 clicks / 2,985 impressions / 7.17% CTR.
- **73% of identifiable clicks are brand.** `fileconcat` alone = 22 clicks
  (pos 1.0, 76% CTR). Of the 30 query-attributed clicks, 22 are the brand name.
  Non-brand discovery barely converts.
- **Biggest single leak: `file concat tool` — 116 impressions, position 1.2,
  0 clicks, 0% CTR.** We rank #1 for our most-shown non-brand query and convert
  nothing. This is the headline impression-to-click gap.
- **Same pattern cluster:** `file combiner` (34 impr, pos 9, 0 clk), `concat
files` (31, pos 5.6, 0 clk), `concatenate files` (13, pos 11.5, 0 clk), `file
concatenation` (58, pos 6.1, 5% CTR). Page-1-ish, near-zero clicks.
- Geography: 84% desktop; top countries US / India / UK / Germany.

**Caveats:** the query export accounts for only 409 of 2,985 impressions (~86%
anonymized long tail).

**API pull (`scripts/gsc-query.mjs`, page-level) — decisive finding:** exactly
**one page has any impressions: the homepage `https://fileconcat.com/`** (all
211 clicks, all 2,919 impressions, 90d). Every docs page, both persona pages,
and everything else got **zero impressions in 90 days**. The entire search
footprint is the homepage ranking for generic concat/combine terms, and
`file concat tool | https://fileconcat.com/` confirms the leak: 114 impressions,
position 1.2, 0% CTR, all on the homepage. Fuller query pull also surfaced weak
how-to intent we do not serve: `how do you combine files` (pos 74), `how to join
files together` (pos 55).

**Reprioritisation from this data:**

1. The real win is the **landing-page title/snippet CTR** on generic
   concat/combine queries, not the docs meta (gap 2). Docs pages do not appear
   in the visible query data at all; the leak is on `/`.
2. Comparison / blog content (gap 3) is **net-new demand capture**, not rescue:
   competitor-branded queries ("repomix alternative") give us zero impressions
   today. Second wave, after the CTR rescue on queries we already rank for.
3. Gap 2 (docs meta) drops to hygiene / long-tail, below the landing CTR fix.

## Decisions

- **Success metric = GSC organic clicks / CTR / authority**, not GA4 on-site
  behaviour.
- **GA4: skipped for now.** It does not measure impressions or CTR (the stated
  goal), and it adds cookies + consent burden that strain the privacy brand
  ("analytics must not break the privacy brand"). Revisit only if we later need
  an on-site conversion funnel, and prefer a cookieless tool (e.g. Plausible) if so.
- **GSC access = service-account script** (`scripts/gsc-query.mjs`, zero-dep,
  reads the gitignored key). Repeatable; re-run for future pulls.
- **Do all four gaps.** Blog: build the **infrastructure now, defer content
  writing.** Docs/persona zero-impression is treated as _not indexed yet_ (pages
  ~1 week old post-redesign), not as "cannot rank" — recheck in 2-4 weeks.

## Progress

- **A. Homepage title/meta rewrite — DONE.** `routes/index.tsx`: title now
  "File concat tool. Combine files into one.", description leads with the generic
  concat/combine intent. Targets the queries we already rank for. Typecheck green.
- **D. Sitemap `/app` removal — DONE.** Dropped the redirecting `/app` entry from
  `generate-sitemap.ts`; regenerated `sitemap.xml` (15 -> 14 urls).
- **B. Docs/persona indexation — deferred to observation.** Recheck GSC in 2-4
  weeks. The MDX frontmatter pipeline from C now exists, so `docs/$slug.tsx`
  already prefers per-page `frontmatter.title`/`description` when present (falls
  back to the slug otherwise) — adding frontmatter to the 11 docs MDX is now a
  no-plumbing content edit, left for the reindex window.
- **C. Blog infrastructure — DONE.** MDX frontmatter parsing wired into
  `vite.config.ts` (`remark-frontmatter` + `remark-mdx-frontmatter`); `lib/blog.ts`
  loader (eager glob, draft filter, date sort); `/blog` listing (typographic, not
  cards) + `/blog/$slug` post page reusing the docs prose system;
  `components/blog/blog-shell.tsx`; sitemap auto-includes non-draft posts; footer
  "Blog" link gated on `hasPublishedPosts()`. One draft fixture
  (`content/blog/combine-files-for-llm.mdx`, dev-only) documents the format.
  Typecheck + eslint green, both routes SSR 200, screenshotted. Content deferred.

## Open decisions (resume here)

- **Blog content — planned, implementation deferred.** Keyword research +
  content plan are in [blog-plan.md](./blog-plan.md): slate is Post 1 (combine
  files how-to), Post 2 (codebase→LLM), Post 3 (combine documents); comparison
  post deferred. Next session runs the exhaustive keyword-research pre-step, then
  builds the rich-element MDX components and writes the posts. Key finding: the
  category vocabulary is "codebase/repo→LLM", we speak "files/folder" — the blog
  is how we enter it. Privacy claims are scoped: "nothing uploaded to us", never
  claims about what the AI does with pasted text.
- **Homepage CTR ceiling:** owner confirmed we are #1 for "file concat tool" with
  no AI Overview above us, so the title/snippet fix has a high ceiling. If CTR
  stays ~0 after reindex, revisit.
