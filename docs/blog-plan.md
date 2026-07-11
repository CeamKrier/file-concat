# Blog implementation plan

Planning artifact for the blog-content initiative. Research done 2026-07-11.
**Implementation is deferred to a later session.** Source of truth for the
wider discoverability work: [DISCOVERABILITY.md](./DISCOVERABILITY.md). The blog
infrastructure (routes, MDX frontmatter, loader, shell, draft support) already
shipped on `development`; this plan covers content + the rich-element system.

## Hard constraint: what privacy we can and cannot claim

- **CAN say:** the bundling happens 100% in your browser; files are never
  uploaded to FileConcat; no account; document text is extracted on your machine.
- **CANNOT say:** anything about whether ChatGPT / Claude / OpenAI / Google
  trains on the text you paste into _them_. That is outside FileConcat's control.
  Do **not** write "without training on your data", "your data stays private from
  the AI", or similar. Brand principle: trust through transparency, not claims.
- The honest one-liner for every post: **"Nothing is uploaded to us — the whole
  thing runs in your browser."**

## Keyword map (research-backed)

**Core finding — vocabulary gap.** The category is won on
**"codebase / repo → LLM / prompt"**; FileConcat's copy says "files / folder".
We are #1 for generic "file concat" (utility) but invisible for the high-value
codebase→LLM category Repomix / gitingest own. The blog is how we enter that
vocabulary without rebranding the homepage.

Competitor phrasing (for tone + keyword mining):

- **Repomix:** "Pack your codebase into AI-friendly formats"; "feed your codebase
  to LLMs like Claude, ChatGPT, Gemini". Features: token counting, git-aware,
  code compression, security.
- **gitingest:** "Prompt-friendly codebase"; "Turn any Git repository into a text
  digest for feeding a codebase into any LLM".
- **code2prompt:** "convert your codebase into a single LLM prompt"; GitHub topics
  chatgpt/claude/llm/prompt-engineering.
- **Converter micro-category:** repo2txt.com, git2txt, folder2text.com,
  Project2Txt, RepoToText, foldertotxt — many small tools own "repo to text" /
  "folder to text".

Clusters:

| Cluster | Example queries | SERP type | Role |
| --- | --- | --- | --- |
| **A — utility** | file concat tool, file combiner | tool | homepage (already #1) |
| **B — combine-files how-to** | how to combine files, how to join files together | blog articles (winnable) | Post 1 |
| **C1 — codebase→LLM** | give ChatGPT my codebase, feed repo to Claude, export repo to prompt | blog articles + tools | Post 2 |
| **C2 — token budget** | how many tokens is my codebase, fit repo in context window | feature/tool | sub-section of Post 2 |
| **D — alternatives** | repomix alternative, gitingest alternative, repo to text tool | listicles | comparison post (deferred) |
| **E — persona docs** | combine PDFs for ChatGPT, bundle case files for AI | weak/scattered | Post 3 + persona pages |
| **F-code — converter** | repo to text, github repo to txt, folder to text, code to text | tools (crowded, fragmented) | homepage/landing keyword; how-to variant in Post 2 |
| **F-doc — MISMATCH** | docx to text, merge word documents | office-productivity mergers (produce .docx, not LLM text) | **skip** — target the AI-flavored doc query instead |

Wedge across all: **browser-based + nothing uploaded to us + document extraction
(PDF/docx) + multi-source (GitHub/GitLab/Bitbucket) + live token cost.** Most
converter tools do one of these; FileConcat does all.

## Content format doctrine: interactive essays

No walls of text. Every post: scannable sections (≤2-3 short paragraphs each),
at least one rich element per section, and the tool embedded at the action
moment. **MDX components to build (pre-req for writing posts):**

- **`<TryIt>`** — inline embedded dropzone. Reuse the persona-page embed pattern
  (`components/personas/*` already host `AppFlow` / `DropZone`). Placed at the
  "now do it with your files" moment, not bolted to the end.
- **`<Callout type="tip" | "warn">`** — short emphasis / honest caveat, breaks text.
- **`<Steps>`** — a real numbered flow (only where order carries information).
- **`<BeforeAfter>`** — `cat` output vs FileConcat's structured bundle, or token
  count before/after filtering. Serves the "precision" brand value.
- Register these in a blog-scoped MDX provider (extend `mdx-provider.tsx` or a
  `blog-mdx-provider`), so posts use `<TryIt />` etc. directly in `.mdx`.

Constraints from the brand register (already loaded): quiet-utility voice, no
card grids, no editorial-serif, reuse the docs prose system. Motion stays
restrained to match the existing site.

## Post slate — this round: 1, 2, 3 (comparison deferred)

### Post 1 — combine files how-to (fastest win; we already rank)

- **Cluster:** B (∩ C). **Primary:** how to combine multiple files into one /
  combine files for ChatGPT. **Secondary:** how to join files together, merge
  files into one document for AI.
- **Title candidates:** "How to combine multiple files into one prompt for
  ChatGPT or Claude" (draft exists) · "Combine many files into one clean prompt
  for an LLM".
- **Outline:** the problem (the chat box takes one block) → three ways: manual /
  `cat` / FileConcat, with a `<BeforeAfter>` (raw cat vs labeled structure) →
  `<TryIt>` → why structure matters → short token note. Privacy line: in-browser,
  nothing uploaded to us.
- **Components:** BeforeAfter, TryIt, Callout. **Links:** /docs/quick-start,
  /docs/file-filtering.

### Post 2 — feed your codebase to an LLM (enters the Repomix vocabulary)

- **Cluster:** C1 + C2 + F-code. **Primary:** how to give ChatGPT / Claude your
  whole codebase; feed a repo to an LLM. **Secondary:** repo to text, export repo
  to LLM prompt, codebase to text, how many tokens is my codebase.
- **Title candidates:** "How to feed your whole codebase to ChatGPT or Claude" ·
  "How to give an LLM your entire codebase without blowing the context window".
- **Outline:** why pasting raw code fails (noise + tokens) → context-window math
  with a `<BeforeAfter>` token count → filter the noise (lockfiles, build, vendored)
  → paste a GitHub/GitLab URL as `<Steps>` → `<TryIt>` → honest "when to use
  Claude Code / RAG instead" `<Callout>` → token-budget takeaway.
- **Components:** BeforeAfter (tokens), Steps, TryIt, Callout. **Links:**
  /docs/github-import, /docs/token-estimation, /docs/file-filtering.

### Post 3 — combine documents for an LLM (document lane; lowest competition)

- **Cluster:** E + B (AI-flavored doc query, **not** "docx to text").
  **Primary:** combine PDFs / documents for ChatGPT; bundle documents for AI.
  **Secondary:** combine research papers for an LLM, one prompt from many PDFs.
- **Title candidates:** "How to combine PDFs and documents into one prompt for
  ChatGPT or Claude".
- **Outline:** the mixed-document problem (PDF + Word + notes) → FileConcat
  extracts the text in your browser → privacy line (extraction on your machine,
  nothing uploaded to us — scoped, honest) → `<Steps>` drop documents → `<TryIt>`
  → honest limits `<Callout>` (scanned/image-only PDFs yield no text, no OCR in v1).
- **Components:** Steps, TryIt, Callout. **Links:** /for/legal, /for/researchers,
  /docs.

### Deferred — comparison post

"FileConcat vs Repomix vs gitingest vs repo2txt": honest feature matrix; wedge =
browser + privacy + documents + multi-source + token cost. Also pursue getting
listed in the alternatives listicles (eliteai.tools, aitoolnet). Write after 1-3
ship and we have GSC signal.

## Build sequence (next session)

0. ~~**Run the exhaustive keyword-research pre-step (spec below).** Finalize the
   primary/secondary keyword + title/H1 per post from real data before writing.~~
   **DONE 2026-07-11** — output in [blog-keywords.md](./blog-keywords.md). Primary
   /secondary keyword + title + H1 per post are locked there.
1. Build the MDX components (`TryIt`, `Callout`, `Steps`, `BeforeAfter`) + the
   blog MDX provider. Verify in dev with the draft fixture.
2. Write **Post 1**, screenshot-verify, flip `draft: false`, publish. (Footer
   Blog link + sitemap entry appear automatically on first published post.)
3. Write **Post 2**, then **Post 3**.
4. Regenerate sitemap, submit /blog + posts in GSC, recheck impressions in 2-4 weeks.
5. Comparison post + listicle outreach once there is signal.

## Pre-step spec — exhaustive keyword research (run first, next session)

**Goal:** for every cluster, a ranked keyword list with intent + competition read,
and a chosen primary + 3-5 secondary keywords and a final title/H1 per post.
**Output:** `docs/blog-keywords.md`.

**Methods:**

1. **Autocomplete / related / "People also ask" harvest** for each seed — capture
   the long-tail phrasings real users type (the "can't articulate it" queries).
2. **Competitor keyword extraction** (titles, H1s, meta, feature headings, GitHub
   topics) from: Repomix, gitingest, code2prompt, uithub, repo2txt.com, git2txt,
   folder2text.com, Project2Txt, and the alternatives listicles
   (eliteai.tools/tool/repomix/alternatives, aitoolnet 30-best). Use
   `ctx_fetch_and_index` so the raw pages stay out of context.
3. **GSC re-pull** (`node scripts/gsc-query.mjs`) for new impressions since the
   homepage title change.
4. **SERP-type classification per candidate:** blog-article SERP (winnable) vs
   tool/feature SERP (hard) vs mismatched SERP (skip — e.g. "docx to text").

**Seeds by cluster:**

- **B:** combine files, join files, merge text files, combine files for ChatGPT.
- **C1:** give ChatGPT a codebase, feed repo to Claude, share code with an LLM,
  export repo to prompt, paste repo into ChatGPT.
- **C2:** how many tokens is my codebase, reduce prompt tokens, fit code in
  context window, token count for a repo.
- **F-code:** repo to text, github to text, repo to txt, folder to text, codebase
  to text, code to text.
- **E/doc:** combine PDFs for ChatGPT, combine documents for AI, multiple PDFs into
  one prompt, combine research papers for an LLM.
- **D:** repomix alternative, gitingest alternative, repo to text tool, code to
  prompt tool.

**Scale option:** if broad, run as a workflow — one agent per cluster does the
harvest + competitor extraction + SERP classification, then a synthesis pass
writes `docs/blog-keywords.md`.
