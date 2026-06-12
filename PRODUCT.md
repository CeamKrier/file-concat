# Product

## Register

brand

## Users

People preparing local files for an LLM. The audience spans developers sharing whole codebases with Claude / GPT / Gemini, students bundling multi-file assignments, writers and researchers stitching documents together, and the occasional CLI power user who lives in `fileconcat <path>` from the terminal.

Their context is short-attention and high-stakes: they have a real prompt to send, they want the blob ready in under a minute, and they want to know how many tokens it'll cost before they paste it anywhere. They reach for FileConcat because the alternative is a hand-rolled `cat` pipeline or copy-pasting one file at a time, and because they need to trust that nothing leaves their machine.

The job to be done: turn N local files into one well-formatted, token-counted blob I can paste into an LLM, without uploading anything and without thinking about the tooling.

## Product Purpose

FileConcat is a privacy-first file concatenator for LLM workflows. The web app at fileconcat.com is a fully client-side tool — drop files or a folder, filter what gets included, see the token cost for every major model, copy or download the result. The `fileconcat` npm CLI is the same engine for repeat use from the terminal, sharing logic through `@fileconcat/core`.

Success looks like a returning visitor who never thinks about the tool: they land, drop, copy, and leave. No sign-up, no upload progress bar, no marketing detour. The brand exists to make that workflow obvious and trustworthy on first contact.

## Brand Personality

Calm, precise, developer-trustworthy. The voice is the voice of a well-engineered Unix utility that happens to have a face: it tells you what it does, it doesn't oversell, and the work is the proof. Three words: **considered, exact, quiet**.

The emotional goal on first contact is *"this is built by someone who cares about the same things I do."* The emotional goal in the tool itself is *"I'm in control and I know what's about to be sent."*

## Anti-references

This product should explicitly not look like any of these:

- **Generic SaaS landing.** No gradient hero, no three identical feature cards with icon + heading + paragraph, no animated metric strip, no "trusted by" logo cloud, no tiny tracked uppercase eyebrow above every section.
- **AI-tool maximalism.** No neon, no glow halos, no particle or mesh-gradient backgrounds, no purple/cyan duotone, no generative-looking decoration meant to signal "we use AI."
- **Cream / sand / parchment editorial warmth.** Avoid the currently-saturated warm-tinted near-white body bg, the magazine-serif-on-paper treatment, and the "editorial restraint" template that has become its own AI cliché.
- **Corporate / enterprise.** No navy + gold trust palette, no stock developer photos, no logo cloud as credibility, no polished-but-generic SaaS chrome.

If the page could be mistaken for any of the above on a glance, it's the wrong page.

## Design Principles

1. **Trust through transparency, not claims.** Privacy is shown by how the product behaves (no network on file drop, processing visible in the browser, no account wall), not asserted in marketing copy. The fewer trust badges, the more trustworthy.
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
