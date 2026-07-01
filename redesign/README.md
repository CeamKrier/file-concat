# Handoff: FileConcat UX Redesign

## Overview
A ground-up redesign of **FileConcat** (fileconcat.com) — the browser tool that turns a folder/files/zip/repo into one AI-ready document. The redesign makes the core value path **completely frictionless** for novices (drop → instant result, zero config), while keeping power-user controls **accessible but tucked away**. It also adds a **URL import** entry point, clearer **novice feedback states**, a full **marketing landing page**, and a redesigned **Docs page**.

Goals that drove the design (from the product owner):
- The core "drop a folder → get one output" must be **totally frictionless**. Tweaking is opt-in.
- Treat users as **complete novices**. Explain *what happened* and *why*, always. Never leave someone staring at a dead end ("…now what?").
- **Sharply separate** the in-browser app from the CLI so the two are never confused.
- Multi-file/large-bundle suggestion is **info, not a warning** (no "something's wrong" feeling).
- Tell users **what can be combined** (text) and clearly handle the things that can't (images, binaries, unsupported types).

## About the Design Files
The files in this bundle are **design references created in HTML** (a small reactive prototype runtime) — they show intended **look, copy, and behavior**, not production code to copy directly. The task is to **recreate these designs in FileConcat's existing codebase** and its established patterns:

- **Stack (existing):** React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, `tiktoken` for token counting. Monorepo (`apps/web`, `packages/*`), pnpm + Nx.
- Rebuild the UI with Tailwind + shadcn primitives (Button, Tabs, Dialog/Sheet for the drawer, Textarea, Select, etc.). Do **not** ship the HTML prototype or its `support.js` runtime.
- `support.js` is included only so the `.dc.html` files render if you open them in a browser to inspect behavior. Ignore it for implementation.

How to open the prototypes: open `FileConcat Redesign.dc.html` (the app + landing) and `FileConcat Docs.dc.html` (docs) directly in a browser. The app prototype simulates processing with fake data and a **sample switcher** so you can walk every state.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions are intentional. Recreate the UI faithfully using the codebase's libraries. Exact tokens are listed below. The *data* in the prototype (file counts, token numbers, trees) is mock — wire it to the real file-processing engine.

---

## Design Tokens

### Color (warm, near-black dark theme)
| Role | Hex |
|---|---|
| Page background (base) | `#16130f` |
| Page background (radial top glow) | `#211b13` → `#16130f` |
| Surface / card | `#1c1812` |
| Surface (alt panel / drawer) | `#191510` / `#1a1610` |
| Inset (code, inputs) | `#120f0a` (darkest `#0a0806` for CLI blocks) |
| Border (default) | `#2c261d` |
| Border (stronger) | `#342d22` / `#3a3329` |
| Hairline divider | `#221d16` |
| Text (primary) | `#f1ebe0` |
| Text (secondary) | `#b3a994` |
| Text (muted) | `#8d8472` |
| Text (faint / labels) | `#6f675a` / `#5f5849` |
| Code text | `#b8b0a0` |
| **Primary / success green** | `#7acd8e` (on-green text `#11261a`) |
| Green tint bg / border | `rgba(122,205,142,.08–.14)` / `rgba(122,205,142,.2–.4)` |
| Green text accent | `#9fdcb0` |
| **Info amber** (heads-up, soft warnings) | `#e3b96a` (tint `rgba(217,168,90,.07–.2)`) |
| **Info blue** (big-bundle, CLI eyebrow) | `#79a6d8` / `#90b6e2` (tint `rgba(121,166,216,.07–.26)`) |

Accent usage: **green = go/success/primary**, **amber = informational heads-up** (never red/alarm), **blue = neutral/optional info + CLI context**.

### Typography (Google Fonts)
- **Display / headings / UI accents:** `Space Grotesk` (600/700). Tight tracking on headings: `letter-spacing: -.02em` to `-.025em`.
- **Body / UI text:** `Hanken Grotesk` (400/500/600/700).
- **Mono (code, file paths, labels, tags, eyebrows):** `JetBrains Mono` (400/500/600).
- Eyebrow label pattern: JetBrains Mono, 10.5–11px, `letter-spacing:.12–.16em`, `text-transform:uppercase`, color `#6f675a` (or `#7c9c86` green-muted).

Type scale used:
- Hero H1: 46px / line-height 1.04 / weight 700 (Space Grotesk)
- Section H2: 32px / 700; Docs section H2: 24px / 700
- Result H2: 30px / 700; final CTA H2: 38px
- Lead paragraph: 16–17px / line-height 1.5–1.6
- Body: 13.5–15px; small/meta: 12–13px; mono labels: 10.5–12px

### Radii
Inputs/buttons `9–10px`; cards `13–14px`; large panels/drop zone `16–20px`; pills/chips `6–9px`; full pills `999px`.

### Spacing / layout
- Content max-widths: hero column `780px`; marketing/docs container `1040px`; result column `720px`; settings drawer `420px` (max `92vw`); docs sidebar `212px`.
- Marketing section vertical padding: `70px` top/bottom, separated by `1px solid #221d16`.
- Sticky top bar height ~`52px`; anchored sections use `scroll-margin-top: 84–86px`.

### Motion
- Spinner: 0.8s linear infinite.
- Drop-zone icon float: 3.4s ease-in-out infinite (subtle ±6px).
- Processing step cadence: ~560ms per step; ~460ms pause before result.
- Copied!/hover transitions: 0.15–0.18s ease.
- **Important:** do not gate first paint on entrance animations (an early prototype bug had wrappers stuck at `opacity:0`). Use Tailwind transitions on real state changes instead.

---

## Screens / Views

The app is effectively a **single-page state machine** with views: `landing` → `processing` → `result`, plus a settings **drawer** overlay and several result-state variants. A persistent top bar sits above all views.

### Top bar (all views)
- Sticky, full-width, `rgba(22,19,15,.82)` + `backdrop-blur(10px)`, bottom hairline `#221d16`. Inner max-width 1180px.
- Left: logo mark (two 15px rounded squares — green `#7acd8e` top-left, cream `#e7e0d2` bottom-right with a 3px page-colored ring) + "FileConcat" (Space Grotesk 600/18px). Clicking it = **Start over** (back to landing).
- Right (landing): `Docs` link → docs page, `GitHub` external.
- Right (result view only): **"Adjust what's included"** button (opens drawer) + **"Start over"** + Docs/GitHub.

### 1. Landing — Hero (view: `landing`)
- Centered column (max 780px), top-aligned with ~34px top padding.
- Status pill (green-tint, mono): `runs in your browser · nothing uploaded` (with a 6px green dot). `white-space:nowrap`.
- **H1:** "Combine files into one AI-ready document." (Space Grotesk 700/46px, `text-wrap:balance`).
- **Subhead:** "Drop a folder, files, or a zip. The noise gets stripped and out comes one clean document for ChatGPT, Claude or Gemini — no setup, no account." (17px, `#b3a994`, max 520px).
- **Drop zone:** full-width, `2px dashed #3a3329`, radius 20px, bg `#1a1610`, padding ~46px. Floating upload-arrow icon in a 62px rounded tile. Title "Drag a folder or files here" + subtitle "…and your file is ready a second later". Two buttons: **Browse files** (green primary) + **Browse folder** (dark `#221d16`, border).
  - Drag-over state: bg `rgba(122,205,142,.08)`, border `#7acd8e`.
  - **On drop (or browse): go straight into processing — do NOT ask any follow-up questions.** This is the #1 frictionless requirement.
- **"What gets combined" reassurance row:** "✓ Code, docs, configs & data" (green check) and "○ Images & binaries skipped for you" (muted).
- **Samples row** ("or try a sample"): chips, each a mono tag + label. Samples must reflect **supported** inputs only: `code · A code folder`, `zip · A .zip`, `.md · Docs & notes`, `mixed · A mixed folder`, `325 · A huge repo`. (In the prototype these trigger demo scenarios; in production they can be omitted or used as real example loaders. **Do not** advertise images as a sample — see Deferred Features.)
- **Import link (progressive):** "Got a link instead? Import from a repo, Gist or URL →" expands the Import panel (see §6).

### 2. Landing — Marketing sections (below hero, view: `landing` only)
Hidden during processing/result. Full-width bands, 1040px inner, separated by hairlines.
- **A — "What you get back":** two columns. Left: eyebrow + H2 "One file, structured so models read it cleanly." + paragraph + three labeled points (TREE / TAGS / FENCES). Right: a sample XML output in a code block (project tree + `<file path lang>` blocks).
- **B — "Not sure what to drop?"** (band bg `#1a1610`): centered H2 "Drop the whole thing. The right files get through." Two cards: **Combined** (green-bordered: Code/Docs/Configs/Data chips) and **Skipped for you** (muted: images, node_modules, *.lock, build output). Below: three green info chips ("Zips unpack themselves", "Repos & Gists import by URL", "Single web pages too"). Then an **amber info box**: images can't be combined (need a vision model — a different tool).
- **C — "Private by design":** two columns. Left: H2 "Nothing leaves your browser." + paragraph. Right: a mock **Network panel** showing only page-load requests + "0 outbound requests · everything runs locally".
- **D — CLI (band bg `#100d09`, clearly separated):** blue pill eyebrow **"Separate tool · command line"**, H2 "Rather work in the terminal?", paragraph stating the browser app needs no install and the CLI is a *separate package*. Code block (`npm install -g @fileconcat/cli` + a `file-concat` invocation). Three points (PIPE / PARSE / JSON). Footnote: "This is the command-line tool — not needed for the browser app."
- **E — Final CTA:** H2 "Drop a folder. Get one file." + **Open the tool ↑** (green; smooth-scrolls to top) + **Read the docs** (links to docs page).
- **Footer:** logo + tagline, link columns (Open tool, Docs / GitHub, npm·CLI), and `MIT · © 2026 FileConcat · built by @CeamKrier` (mono).

### 3. Processing (view: `processing`)
- Centered (max 560px). Circular spinner (72px, green top border) with **live % in the center**.
- Current step title (Space Grotesk 22px) + source label (e.g. "my-app (folder)").
- **Step checklist** below: each step gets a dot that fills green with a ✓ as it completes; current step highlighted, future steps muted. Friendly, plain-language step copy, e.g.:
  - folder: "Reading 47 files" → "Skipping noise — node_modules, lockfiles" → "Counting tokens" → "Packing it into one file"
  - zip: prepend "Unpacking project.zip"
  - repo: "Fetching owner/repo from GitHub" first
  - page: "Fetching the page" → "Extracting readable text" → …
- This step narration is the "explain what's happening" requirement — keep it.

### 4. Result — success (view: `result`, `includedCount > 0`)
- Centered column (720px). Green ✓ in a circle, H2 **"Your file's ready"**, a mono source chip ("my-app (folder)") "→ one document".
- Optional green **note chip** depending on source: zip → "Unpacked the zip and combined everything inside"; repo → "Fetched straight from GitHub — nothing stored."; gist → "Grabbed every file in the gist."; page → "Pulled the readable text off the page — nav, ads and scripts stripped."
- **Summary stats** (3 cards): `<includedCount> files combined`, `<tokens> tokens`, `<skippedNoise> noise files skipped`.
- **Primary actions:** big **Copy** (green; shows "✓ Copied to clipboard" for ~1.6s) + **Download** (dark, with icon). These are the only required actions — everything else is optional.
- **Format row:** segmented control XML / Markdown / Plain (XML default). Live preview updates.
- **Heads-up info card (amber)** when unsupported/binary files were present: title "`N` files aren't text — left out", reassuring body, and a list of `{name, why}` (e.g. `brand.ai` · Illustrator file, `spec.pdf` · "PDF — use the CLI to extract its text"). **Informational tone, never an error.**
- **Big-bundle info card (blue)** when over context window: "Big bundle — splitting is optional, just easier to paste", with a `Keep as one file / Split into parts` toggle. Info, not a blocker.
- **Preview** (`<details>`): "▸ Peek at what your AI receives" → code block of the actual output in the chosen format.

### 5. Result — empty / wrong-input redirect (view: `result`, `includedCount === 0`)
- Shown when nothing combinable was found (e.g. only images dropped). A friendly card: "These look like images, not text", explanation that FileConcat bundles text, the list of dropped files as chips, and a **"Try a folder of files instead"** button. **No dead ends** — always offer the next step. (This is the key novice rescue state.)

### 6. Import panel (progressive disclosure on landing)
- Expands inline (dark card). Title "Paste a link to fetch and combine" + close.
- **Source tabs:** GitHub · GitLab · Bitbucket · Gist · URL (segmented; active = `#221d16` fill). Tab sets the input placeholder + examples.
- **URL input** (mono) + **Fetch** button. Button styling reflects live validity (green when fetchable, muted otherwise).
- **Live caption** under the input as the user types (validation, see below):
  - repo → "✓ GitHub repo — press Fetch"; gist → "✓ Gist — press Fetch"; page → "✓ Web page — readable text only"; non-text file link → "This link points to a non-text file" (amber); invalid → "Not a public link yet" (amber).
- **Example chips** per tab (clickable to fill input).
- **Warning box (amber, friendly)** on a failed Fetch: e.g. "That doesn't look like a link yet…", "Use a specific repo URL, like github.com/owner/repo…", "Only public links can be fetched…", or for a binary/image link "That link points to a {type} file, which can't be read as text. Try a repo, a Gist, or a page with text." Warnings are friendly/info-toned, never red.

### 7. Settings drawer — "Adjust what's included" (overlay, opens from result)
- Right-side sheet (420px), scrim behind. Header: "Fine-tune the output" + "Everything updates live. You don't have to touch any of this." + close ✕.
- **Quick presets** (chips, toggle active): React / Next, Vue, Python, Go, Rust, Source only, Docs only.
- **Ignore** textarea (mono globs), default `.git, node_modules, dist, build, *.lock, package-lock.json, .DS_Store`, with helper "node_modules, lockfiles & binaries are skipped automatically."
- **Only include** textarea (optional globs; "empty = everything readable").
- **File tree** (indented, checkboxes; uncheck to exclude; auto-skipped noise shown dimmed). Header shows "Files · `N` in".
- **Cost estimate** card: `<tokens> tokens` + `$cost`, model `<select>` (Claude Sonnet / GPT-4o / Gemini 2.5 Pro / GLM-4.6).
- Footer note: CLI is a *separate* tool (link), reinforcing the app/CLI split.

### 8. Docs page (`FileConcat Docs.dc.html`)
- Same top bar (logo links back to the tool; "Open the tool" green button; GitHub).
- **Layout:** 1040px container, 2-col grid: sticky left **sidebar nav** (212px, `top:84px`) + content (max ~720px). Footer below.
- **Sidebar = scrollspy:** nav items get an active state (white text, weight 600, 2px green left-border) based on which section is in view; clicking sets active + native anchor jump. Sections use `scroll-margin-top:86px`.
- **Sections (each `<h2>` with an `id`):** Quick start (3 step cards) · What gets combined (Combined/Skipped cards + amber image note) · Output formats (XML/Markdown/Plain samples + split note) · Filtering & presets (PRESETS/IGNORE/INCLUDE/TREE) · Import by URL (supported sources + examples + zip/page notes) · Tokens & cost (COUNT/COST/SPLIT) · Privacy (0 outbound requests chip) · **CLI · separate tool** (blue eyebrow pill, install + invocations + flag list `-o`, `--parse`, `--json`, `-i/-e`) · FAQ (images? upload? huge repo? PDF/DOCX? offline?).

---

## Interactions & Behavior
- **Drop / browse → processing immediately**, no intermediary questions. Apply smart-ignore automatically and prepare the output; surface a single Copy/Download.
- **Top bar logo / Start over** → reset to landing.
- **Format toggle** → re-renders the preview and (in production) the actual output/token count.
- **Copy** → copies output; button confirms "✓ Copied…" for ~1.6s.
- **Adjust what's included** → opens drawer; all controls update the bundle live (counts, tokens, tree inclusion).
- **Import:** validate as the user types; Fetch either starts processing (repo/gist/page) or shows a friendly warning. Pressing Enter = Fetch.
- **Final CTA "Open the tool ↑"** → smooth `window.scrollTo({top:0})` (do not use `scrollIntoView`).
- **Docs nav** → scrollspy highlight + anchor jump.

## State Management
Prototype state (recreate with React state / store):
- `view`: `'landing' | 'processing' | 'result'`
- `scenarioKey` / source descriptor (real: the parsed input — folder, zip, repo, gist, page)
- Derived result data: `source`, `includedCount`, `totalFiles`, `skippedNoise`, `tokens`, `unsupportedList: [{name, why}]`, `note`, `bigBundle`
- `format`: `'xml' | 'md' | 'txt'`; `splitMode`: `'single' | 'multi'`
- `settingsOpen`, `activePreset`, `includeText`, `ignoreText`, `excluded` (set of paths)
- Processing: `stepIndex` driving the % + checklist
- Import: `importOpen`, `importTab`, `urlText`, `urlWarning`, plus live URL classification
- UI: `isDragging`, `copied`
- Docs: `activeId` (scrollspy)

**URL classification** (prototype `classifyUrl` — reimplement; in production decide via real fetch/host rules): returns one of `repo | gist | page | binary | bad | empty`. Recognizes `owner/repo` shorthand and full URLs; maps github/gitlab/bitbucket → repo, gist.github.com → gist, other hosts → page; flags links ending in image/font/media/archive/binary/PDF/PSD/AI extensions as non-text; rejects non-public/local hosts.

## Deferred / Feature-level work (UI designed, engine not built in prototype)
These need real implementation beyond the visual recreation:
1. **Zip auto-unpack** — unzip in-browser and feed contents into the same pipeline (UI feedback is designed: unpack step + note chip).
2. **URL / repo / Gist / web-page ingest** — actual fetching (GitHub API, raw fetch, CORS handling, readable-text extraction for pages). UI + validation are designed.
3. **Text-vs-binary detection by content, not just an extension allowlist** — product owner wants: if a dropped file *isn't actually binary*, try to process it even if the extension is unusual (e.g. `.ai` that is XML/text). Sniff content (e.g. detect NUL bytes / decode as UTF-8) and only skip true binaries; update the ignore/skip logic accordingly, and tell the user what was skipped and why.
4. **Image support is explicitly OUT of scope** for concatenation (images aren't text). If image understanding is ever wanted, it's a **separate feature** requiring a vision-capable model — plan it independently. Do not present image concat as supported.
5. Keep the **CLI strictly separate** in code and copy from the in-app flow.

## Assets
- No raster assets. Logo is pure CSS (two rounded squares). Icons are inline SVG (upload arrow, check, download) — replace with the codebase's icon set (e.g. lucide, already common with shadcn).
- Fonts: Space Grotesk, Hanken Grotesk, JetBrains Mono (Google Fonts) — add via the app's font pipeline.

## Files
- `FileConcat Redesign.dc.html` — the app (landing + hero/drop, processing, result, all feedback states, import panel, settings drawer) and the marketing landing sections + footer.
- `FileConcat Docs.dc.html` — the Docs page.
- `support.js` — prototype runtime only; **ignore for implementation**.
