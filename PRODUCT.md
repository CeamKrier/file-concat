# Product

## Register

brand

## Users

People preparing local files for an LLM. The audience spans developers sharing whole codebases with Claude / GPT / Gemini, students bundling multi-file assignments, writers and researchers stitching documents together, and the occasional CLI power user who lives in `fileconcat <path>` from the terminal.

Their context is short-attention and high-stakes: they have a real prompt to send, they want the blob ready in under a minute, and they want to know how many tokens it'll cost before they paste it anywhere. They reach for FileConcat because the alternative is a hand-rolled `cat` pipeline or copy-pasting one file at a time, and because they need to trust that their files aren't uploaded to a server to be read.

The job to be done: turn N local files into one well-formatted, token-counted blob I can paste into an LLM, without uploading anything and without thinking about the tooling.

## Product Purpose

FileConcat is a privacy-first file concatenator for LLM workflows. The web app at fileconcat.com is a fully client-side tool — drop files or a folder, filter what gets included, see the token cost for every major model, copy or download the result. The `fileconcat` npm CLI is the same engine for repeat use from the terminal, sharing logic through `@fileconcat/core`.

Success looks like a returning visitor who never thinks about the tool: they land, drop, copy, and leave. No sign-up, no upload progress bar, no marketing detour. The brand exists to make that workflow obvious and trustworthy on first contact.

## Brand Personality

Calm, precise, developer-trustworthy. The voice is the voice of a well-engineered Unix utility that happens to have a face: it tells you what it does, it doesn't oversell, and the work is the proof. Three words: **considered, exact, quiet**.

The emotional goal on first contact is *"this is built by someone who cares about the same things I do."* The emotional goal in the tool itself is *"I'm in control and I know what's about to be sent."*

## Voice

Written 2026-10-13 from a read of Mailchimp, NN/g, GOV.UK, Plausible, Artificial Analysis, the GEO paper (KDD 2024) and Google's helpful-content guidance, plus an audit of the shipped copy. The voice stays the same on every surface; the tone moves with the reader's state.

**The voice, as "this, not that":**

- **Exact, not hedging.** A finding names its quantity and its population. "Half way" needs "of 1,403 PDF pages" beside it.
- **Plain, not clever.** No metaphors, no jokes in product copy, no coined terms where a common word exists. Sentences over 25 words get split.
- **Candid about our limits, not self-deprecating.** We say what the tool did not do and why it stopped, in one sentence, then move on.
- **Direct about rivals, never mocking.** We compare with numbers and say where we lose. No "powerful", "blazing", "seamless", no superlative a number does not back.
- **Quiet, not urgent.** No exclamation marks, no countdowns, no "don't miss". The one loud line on a page is a measured result.

On NN/g's four tone dimensions we sit at: casual-leaning (not formal), serious, respectful, matter-of-fact. Their study is why: trust explained 52% of how much people wanted a product, and the playful variant scored lower on trust.

**Tone by reader state:**

| Where | The reader | Tone |
| --- | --- | --- |
| The tool | mid-task, wants control | the shortest sentence that says what happened and what is next |
| Search guide | hit a limit or an error | name the failure, then the path, with real file names |
| Research post | checking whether to believe us | numbers with quantity, baseline and method; prose rounds, tables are exact |
| Persona page | a professional who carries the risk | bounded claims only, never a verdict on their compliance |
| Privacy page | looking for the catch | every exception listed, nothing absolute |

**Words.** One name per thing, everywhere:

| Use | Not |
| --- | --- |
| FileConcat | the tab, the tool (as a name), the app |
| bundle (the output), or "one file" in plain copy | blob, prompt, document, digest |
| drop (files, a folder into FileConcat) | drag; "upload" only for what the reader does at the assistant |
| in your browser | locally, on-device (when the browser is meant) |
| plain words for analyst terms | p90, signal density, neff, predicate |

Cut on sight: "actually", "worth" as a sentence opener, "simply", "just" (as a minimiser), "powerful", "seamless", "effortless", "leverage", "unlock".

**Privacy, the ladder.** Strongest true claim first, nothing above it:

1. "Your files are not uploaded to us. The whole thing runs in your browser."
2. "Anonymous usage analytics run, and the privacy page says what they see."
3. After the paste, nothing: "What you then paste into an assistant is your own choice, but preparing the file uploads nothing."

Never: "nothing leaves your device", "no telemetry", "privately" attached to the assistant, "Suitable for ..." badges, or anything about whether a vendor trains on what is pasted.

**Why this reaches readers and answer engines.** The GEO paper measured that adding statistics, quotations and cited sources raised a source's visibility in generative answers by 30 to 40%, while an authoritative tone gave no significant gain and keyword stuffing did not work. Google's guidance asks for first-hand expertise and warns against writing for search engines. So we never force a search phrase into a sentence; the measured number does that work.

## Anti-references

This product should explicitly not look like any of these:

- **Generic SaaS landing.** No gradient hero, no three identical feature cards with icon + heading + paragraph, no animated metric strip, no "trusted by" logo cloud, no tiny tracked uppercase eyebrow above every section.
- **AI-tool maximalism.** No neon, no glow halos, no particle or mesh-gradient backgrounds, no purple/cyan duotone, no generative-looking decoration meant to signal "we use AI."
- **Cream / sand / parchment editorial warmth.** Avoid the currently-saturated warm-tinted near-white body bg, the magazine-serif-on-paper treatment, and the "editorial restraint" template that has become its own AI cliché.
- **Corporate / enterprise.** No navy + gold trust palette, no stock developer photos, no logo cloud as credibility, no polished-but-generic SaaS chrome.

If the page could be mistaken for any of the above on a glance, it's the wrong page.

## Design Principles

1. **Trust through transparency, not claims.** Privacy is shown by how the product behaves: files are read and combined in the browser and never uploaded to be processed, and there is no account wall. It is stated accurately, never as an absolute ("0 requests", "nothing leaves your device") that a devtools check can refute, because anonymous product analytics (Microsoft Clarity) does run and is disclosed plainly on `/privacy` rather than papered over. The fewer trust badges, the more trustworthy.
2. **Restraint is the brand.** Every element earns its place. Absence — empty space, missing decoration, the section we didn't add — is a design choice, not a vacancy. Inspired by quiet-utility references (Linear, Raycast, Height).
3. **The tool is the landing.** The marketing surface should put the user closer to the workflow, not further from it. Hero copy explains less than the live tool below it does.
4. **Precision over polish.** Token counts must be honest, file-type detection must be correct, the filter list must reflect what actually ships in the blob. A misleading number is a brand failure; an unornamented true number is a brand win.
5. **Quiet by default, expressive on intent.** Color, motion, and weight are reserved for the moments that need them — the cost-comparison readout, a destructive confirmation, the "copied" affordance. The rest of the surface stays out of the way.

## Accessibility & Inclusion

- **WCAG AA** as the production floor. Body text ≥ 4.5:1 against background; large text ≥ 3:1; placeholder text held to the same body-text bar, not the muted-gray default.
- **Keyboard-complete.** Every action reachable without a pointer, including file drop (use a file-picker fallback), config panel, file tree navigation, preview modal dismissal, and copy/download.
- **Visible focus states** on every interactive element; never `outline: none` without a replacement.
- **`prefers-reduced-motion: reduce`** honored on every animation — entrance reveals, hover transitions, modal open/close — with a crossfade or instant alternative.
- **Color is never the only signal.** Status (success, error, warning) carries an icon or text label in addition to color, for color-vision differences.
- **Tested in both themes.** Light and dark must pass the same contrast bar; dark mode is not exempt from the AA floor.
