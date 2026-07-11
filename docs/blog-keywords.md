# Blog keyword research

Output of the exhaustive keyword-research pre-step (step 0 of the blog build
sequence in [blog-plan.md](./blog-plan.md)). Research run 2026-07-11.

**Method:** real Search Console pull (`node scripts/gsc-query.mjs`, 90d) +
per-cluster SERP-type classification via live web search + competitor vocabulary
extraction (Repomix, gitingest, code2prompt, uithub, repo2txt/git2txt/folder2text,
alternatives listicles). Ranking is by SERP-winnability and search intent, not
absolute volume: no keyword-volume tool was available, so treat "competition"
and "SERP type" as the primary signals and volume as unknown (see Risks).

**SERP type legend:** `blog` = how-to articles rank (winnable) · `tool` = apps /
product pages / GitHub repos rank (hard to outrank with an article) · `mixed` =
both · `mismatch` = wrong intent, skip.

## GSC reality (the grounding)

90-day window 2026-04-12 to 2026-07-10: 211 clicks, 2,919 impressions, CTR 7.2%,
avg position 6.7.

- **100% of impressions land on the homepage.** No other page is indexed with
  impressions. The blog starts from zero.
- **The codebase-to-LLM category is entirely absent.** Zero impressions for any
  "repo to text", "feed codebase to LLM", or Repomix-style query. This is the
  vocabulary gap, confirmed in real data, and is why Post 2 exists.
- **Cluster B how-to queries already surface, but deep:** "how do you combine
  files" at pos 73.8, "how to join files together" at pos 55.2. Latent relevance
  a dedicated post can lift. FileConcat also already ranks for "combine multiple
  files into one prompt for AI".
- **Faint code signal:** "code combiner" pos 8.8, "combine all code" pos 10.0.

### Separate finding: homepage CTR click-leak (not a blog task)

`file concat tool` ranks **pos 1.2 with 114 impressions but 0 clicks (0% CTR)**.
The top-volume query on which we already rank first converts nobody, so the SERP
snippet is failing to earn the click. This is a homepage title/meta copy problem,
independent of the three posts. **Action:** rewrite the homepage `<title>` and
meta description to lead with the exact phrase "file concat tool" plus a concrete
value hook (in-browser, LLM-ready, nothing uploaded to us, live token counts).
Snippet-copy fix, not a ranking fix. Keep it from competing with Post 1 for the
how-to intent (homepage owns the utility term, Post 1 owns the how-to).

## Final targeting per post (the deliverable)

### Post 1 - combine files how-to (clusters B, C1)

- **Primary:** `how to combine multiple files into one for ChatGPT`
- **Secondary:** how to combine multiple text files into one for AI prompt ·
  merge text files into one for LLM · how to combine files into one prompt for
  Claude · how to concatenate multiple files into one file · combine multiple
  files into one prompt for AI
- **Title (50):** How to Combine Multiple Files Into One for ChatGPT
- **H1:** How to Combine Multiple Files Into One for ChatGPT
- **Meta (143):** Turn several files into one clean, LLM-ready text blob for
  ChatGPT or Claude. Bundle folders and repos in your browser, with live token
  counts.
- **Why:** We already surface (deep) for the generic head terms, but their SERPs
  are owned by office mergers (Adobe, Smallpdf, iLovePDF). So target the
  **AI-qualified** variant, which disambiguates from the PDF-merger crowd and is
  the winnable, high-intent lane. Keep the command-line "concatenate" phrasing as
  a supporting section and internal link, not the primary.

### Post 2 - feed your codebase to an LLM (clusters C1, C2, F-code)

- **Primary:** `how to feed entire codebase to an LLM`
- **Secondary:** how to give ChatGPT my codebase · how to fit a large codebase
  into ChatGPT context window · how to convert a github repo to text for chatgpt ·
  best way to share codebase with ChatGPT · repomix vs gitingest vs code2prompt
- **Title (41):** How to Feed Your Whole Codebase to an LLM
- **H1:** How to Feed Your Entire Codebase to an LLM (ChatGPT, Claude)
- **Meta (149):** Pack your whole repo into one AI-friendly text blob and paste
  it into ChatGPT or Claude. Import from GitHub, filter noise, and see token
  counts live.
- **Why:** The vocabulary-gap post. Enters the Repomix/gitingest/code2prompt
  category we are invisible for. Every chosen keyword is a blog-winnable
  how-to/question phrasing (mixed or blog SERPs with real editorial slots: WorkOS,
  Medium, DEV, HN) rather than the tool-saturated bare nouns ("repo to text",
  "export repo to prompt") that competitor GitHub repos own and that are the tool
  page's job, not a blog's. Adopts category vocabulary ("feed your codebase to an
  LLM", "AI-friendly", "pack your repo") while pulling in the C2 token-budget
  angle that FileConcat's live token counter uniquely serves. The comparison
  keyword is a genuine editorial gap and lets us position as the in-browser,
  privacy-first, multi-source, docs-capable option.

### Post 3 - combine documents for an LLM (cluster E)

- **Primary:** `convert PDF to text for LLM prompt`
- **Secondary:** how to feed multiple PDFs to ChatGPT at once · how to summarize
  multiple research papers with ChatGPT · how to give ChatGPT a whole folder of
  documents · combine multiple PDFs into one text file for ChatGPT · how to upload
  multiple documents to ChatGPT
- **Title (37):** Convert PDF to Text for an LLM Prompt
- **H1:** How to Convert PDFs to Text for an LLM Prompt
- **Meta (145):** Turn PDFs and DOCX files into clean text for an LLM prompt.
  Bundle many documents into one blob in your browser, with live token and cost
  counts.
- **Why:** Lowest-competition lane, and a category no code-repo competitor claims
  (Repomix/gitingest/code2prompt are code-only; FileConcat's PDF/DOCX extraction
  is the differentiator). The primary is validated by shir-man.com (a
  privacy-first offline converter) already ranking #1, which proves both the
  intent and that our in-browser/privacy angle is winnable on a mixed SERP. The
  "into one TEXT file for ChatGPT" qualifier disambiguates from new-PDF-output
  intent; skip the generic "merge PDF" head terms owned by Smallpdf/Adobe/iLovePDF.

## Ranked keyword tables per cluster

Roles: `primary` and `secondary` are targets; `skip` rows are recorded so we
avoid chasing SERPs we cannot win or that carry the wrong intent.

### B - combine files how-to

| Keyword | Role | SERP | Comp |
| --- | --- | --- | --- |
| how to combine multiple files into one for ChatGPT | primary | mixed | medium |
| combine multiple files into one prompt for AI | secondary | mixed | medium |
| merge text files into one for LLM | secondary | mixed | medium |
| how to combine multiple text files into one for AI prompt | secondary | mixed | medium |
| how to combine files into one prompt for Claude | secondary | mixed | medium |
| how to concatenate multiple files into one file | secondary | blog | medium |
| how to combine multiple files into one | skip | mismatch | high |
| how to join files together | skip | mismatch | high |
| combine multiple files into one document | skip | mismatch | high |

Rankers seen: shir-man.com (Text File Merger for LLM), community.openai.com,
github.com/simonw/files-to-prompt, learnprompting.org, baeldung.com,
computerhope.com. The bare "combine/join files" heads return Adobe/iLovePDF-style
office mergers, hence skip.

### C1 - codebase to LLM

| Keyword | Role | SERP | Comp |
| --- | --- | --- | --- |
| how to give ChatGPT my codebase | primary | mixed | medium |
| how to give an LLM my whole codebase | secondary | blog | low |
| how to feed entire codebase to ChatGPT without hitting the token limit | secondary | blog | low |
| best way to share codebase with ChatGPT | secondary | mixed | medium |
| how to share my code with an LLM | secondary | blog | medium |
| repomix vs gitingest vs code2prompt | secondary | tool | medium |
| can I paste a whole github repo into Claude | secondary | mixed | medium |
| paste entire repo into ChatGPT | secondary | mixed | medium |
| feed a repo to Claude | skip | tool | high |
| export repo to prompt | skip | tool | high |
| convert github repo to single text file for LLM | skip | tool | high |
| turn codebase into LLM prompt | skip | tool | high |

Rankers seen: medium.com (Tolga Taner), dev.to (koistya "How I bundle my
codebase"), news.ycombinator.com (Ask HN), simonwillison.net, honeycomb.io,
support.claude.com. Editorial slots are open; the bare nouns are owned by repos.

### C2 - token budget

| Keyword | Role | SERP | Comp |
| --- | --- | --- | --- |
| how to fit a large codebase into ChatGPT context window | primary | blog | medium |
| fit code in context window | secondary | blog | medium |
| estimate token cost of sending codebase to LLM | secondary | mixed | medium |
| will my repo fit in the context window token limit | secondary | blog | medium |
| how many tokens does my code use before pasting into ChatGPT | secondary | mixed | medium |
| reduce size of code prompt for LLM token budget | secondary | blog | medium |
| how many tokens is my codebase | secondary | tool | high |
| count tokens in a codebase | secondary | tool | high |
| how to reduce prompt tokens | secondary | blog | high |
| how to reduce token usage when coding with AI | skip | blog | high |
| how many tokens in a github repository online tool | skip | tool | high |

Rankers seen: portkey.ai, inventivehq.com, developer.ibm.com, blog.ploeh.dk,
code.claude.com/docs. The "how many tokens is my codebase" nouns return counter
tools/repos; the how-to/question framings are winnable.

### F-code - converter (repo/folder/codebase to LLM-ready text)

| Keyword | Role | SERP | Comp |
| --- | --- | --- | --- |
| how to convert a github repo to text for chatgpt | primary | blog | medium |
| how to feed entire codebase to an LLM | primary | mixed | medium |
| best way to share codebase with chatgpt | secondary | blog | low |
| how to paste a whole repository into claude | secondary | blog | low |
| codebase to text | secondary | mixed | high |
| convert codebase to single text file | secondary | mixed | medium |
| turn a github repo into a single text file for LLM | secondary | mixed | medium |
| export folder contents to text for AI | secondary | mixed | medium |
| repo to text | skip | tool | high |
| github repo to text | skip | tool | high |
| repo to txt | skip | tool | high |
| github repo to prompt | skip | tool | high |
| code to text | skip | mismatch | high |

Rankers seen: github.com/kirill-markin/repo-to-text, repo2txt.com, gitingest.com,
github.com/abinthomasonline/repo2txt, folder2text.com, foldertotxt.frosttools.com.
The bare converter nouns are fully tool-owned: this is the homepage/landing
keyword territory, not a blog's. The how-to framings are the blog's job.

### E - documents to LLM

| Keyword | Role | SERP | Comp |
| --- | --- | --- | --- |
| convert PDF to text for LLM prompt | primary | mixed | medium |
| how to feed multiple PDFs to ChatGPT at once | secondary | blog | medium |
| how to summarize multiple research papers with ChatGPT | secondary | blog | medium |
| how to give ChatGPT a whole folder of documents | secondary | blog | low |
| combine multiple PDFs into one text file for ChatGPT | secondary | mixed | medium |
| how to upload multiple documents to ChatGPT | secondary | blog | medium |
| how to analyze multiple documents in ChatGPT at the same time | secondary | mixed | medium |
| combine PDFs for ChatGPT | skip | mixed | high |
| multiple PDFs into one prompt | skip | mismatch | high |
| combine documents for AI | skip | tool | high |
| extract text from PDF for Claude | skip | tool | high |

Rankers seen: shir-man.com (privacy-first offline PDF-to-txt, ranks #1),
otio.ai, askyourpdf.com, gptbots.ai, community.openai.com, help.openai.com. The
"combine documents for AI" nouns return writing-fusion tools; skip. Thin-authority
how-to/forum SERPs are outrankable.

## Competitor vocabulary to adopt

Deduped, high-value phrasings competitors own that we should weave into the posts
(and eventually the homepage). Adapt, do not lift verbatim, and keep inside the
privacy boundary (see Risks).

- pack your codebase into an AI-friendly format
- pack your whole repo into a single AI-friendly file
- feed your codebase to an LLM
- prompt-friendly codebase
- turn a git repository into a text digest for an LLM
- convert your codebase into a single LLM prompt
- flatten a repository into one text file for an LLM
- concatenate a directory of files into a single prompt
- AI-ready / LLM-ready text blob
- provide code context to an AI assistant
- share your entire repository context with AI tools
- live token counting for LLM context limits
- token and cost counting
- respects your .gitignore
- import from GitHub, GitLab, and Bitbucket
- remote repository processing
- fit your codebase inside the context window
- (our wedge, no competitor says all of these together) all processing happens
  in your browser, your files are never uploaded to us, plus documents (PDF/DOCX)
  and multi-source, plus live token cost

## Risks and open questions

- **No volume data.** Ranking is by SERP-winnability and intent only. Several
  "low competition" winners (e.g. "how to give ChatGPT a whole folder of
  documents", "best way to share codebase with ChatGPT") may be low volume, so
  click upside is unverified.
- **Cold start for Posts 2 and 3.** GSC shows zero impressions for any
  codebase-to-LLM or documents-to-LLM query. Only Post 1 has GSC evidence we
  already surface for its cluster. Posts 2/3 start with no proven latent ranking.
- **Indexing dependency.** All impressions currently land on the homepage. New
  posts need internal links from the homepage and time to index, and there is no
  data yet on whether Google will treat them as distinct from the homepage's
  generic "file concat" relevance.
- **Cannibalization.** Posts 1, 2, 3 share overlapping ChatGPT/Claude how-to
  phrasings. Enforce distinct on-page targeting (the primary per post above) and
  clear internal linking so they do not compete with each other. Same for the
  homepage CTR rewrite vs Post 1.
- **Pillar dilution (Post 2).** It blends three clusters (C1 + C2 + F-code).
  Confirm one pillar can carry the how-to and the token-budget angles, or split
  the token-budget angle into its own future post if focus suffers.
- **Comparison keyword trust.** "repomix vs gitingest vs code2prompt" currently
  surfaces competitor repos. A FileConcat-authored comparison risks reading as
  self-serving; it needs genuinely neutral, sourced content to earn links. (This
  aligns with the plan's deferred comparison post.)
- **Privacy boundary in body copy.** We may say in-browser / not uploaded to us;
  we may never imply anything about whether ChatGPT or Claude train on pasted
  text. Post 3 (PDFs) and Post 2 are the highest-risk spots for an accidental
  training-data claim. Police it in the prose, not just the titles/metas.

## Status and next step

Step 0 of the [blog-plan.md](./blog-plan.md) build sequence is complete. The
primary/secondary keyword, title, and H1 per post are locked above. Next:
**step 1, build the MDX components** (`TryIt`, `Callout`, `Steps`, `BeforeAfter`)
plus the blog MDX provider, then write Post 1.
