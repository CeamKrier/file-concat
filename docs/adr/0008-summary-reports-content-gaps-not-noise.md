# The summary reports content gaps the model can't see, not noise

The bundle summary's exclusions note names only the skipped files that are a
**real content gap** — an image or binary that can't be read as text, a file left
out for exceeding the size limit, a document whose text couldn't be extracted, a
file that couldn't be read at all. It lists their paths (capped, with `+N more`),
and when there is nothing to report it emits **no line at all**. Noise (lock
files, `node_modules`, gitignored paths) and files the user deliberately
deselected are never mentioned. The exact same summary body is used by all three
output styles (XML, markdown, plain); only the wrapper differs.

The note is threaded from the callers as an `ExcludedSummary`
(`packages/core/src/file-processing/exclusions.ts`): the web derives it from
`filter.fileStatuses` via `summarizeExclusions`, the CLI builds it from the paths
it skips while walking. `assembleOutput` renders it; the tree
(`<directory_structure>`) is still built from included files only, so a skipped
file is invisible unless the note names it.

## Why this is worth recording

The old summary ended every XML bundle with a **static** line: `"Skipped: images
and other binaries, plus common noise like lock files and build output."` It fired
regardless of what was actually skipped — a single `username.csv` drop still told
the model images and build output had been removed. Injecting a false claim into
the model's context is worse than saying nothing: it invents gaps to reason about.
A future reader who sees the note list some skipped files but stay silent about a
dropped `node_modules` will ask "why isn't that reported too?" — this is the
answer.

## Considered options

- **Keep a static sentence.** Simplest, zero plumbing. Rejected: it is false
  whenever the real skips don't match the boilerplate, which is most of the time.
- **Report every exclusion, including noise.** Truthful but harmful: a repo drops
  thousands of `node_modules`/lockfile paths, and listing them would bloat the
  context and bury the signal. Noise exclusion is also *expected* — a model
  assumes vendored/generated files aren't in a paste; telling it wastes tokens.
- **Counts only, no paths.** Compact and truthful. Rejected in favor of paths
  (capped): knowing *that* a document was dropped is far less useful to the model
  than knowing *which* one, so it can note the gap or ask for it. The `+N more`
  cap keeps the pathological case bounded.
- **Put the skipped files in the tree instead.** The tree could show skipped
  files with a marker, making the note redundant. Rejected for now: it changes the
  tree's meaning (currently "what's included") and every consumer's expectation of
  it; the summary note is a smaller, reversible surface.

## Consequences

- **The blob is now a light contract.** Downstream tooling can read the
  `Not included (content not shown):` block. Its wording and the per-category
  labels are load-bearing and shouldn't drift casually.
- **Category definitions live in one place.** `summarizeExclusions` maps exclusion
  *reasons* to the four gap categories by matching the reason strings produced in
  the web hooks and CLI. New exclusion reasons that represent a content gap must be
  mapped there, or they will be silently omitted from the note.
- **User curation stays invisible by design.** Deselecting a file in the web UI
  removes it from the bundle *and* from the note — the model is shown the user's
  curated view, not told what the user chose to withhold.
- **Style parity is enforced by test.** The summary body is asserted identical
  across XML/markdown/plain, so a future style tweak can't reintroduce
  format-dependent content.
