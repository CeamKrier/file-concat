# Binary files are locked out of curation, not re-includable

The web filter layer documented the manual per-file toggle as a **universal
escape hatch** — "an explicit include no longer disables ignores; the manual
per-file toggle is the escape hatch for a one-off" (`use-filter-state.ts`). Any
file, even one excluded by a pattern, could be pulled back into the bundle by
clicking its tree row. But ingestion (`use-file-ingestion.ts`) decodes every
non-extractable file's bytes to text and pushes them into `entries` — including
true **Binary files** (images, archives, media), whose decoded form is mojibake.
So force-including a binary from the tree wrote garbage straight into the bundle:
the same false-context harm ADR-0008 fought on the *summary* side, reappearing on
the *payload* side. This ADR records carving binaries out of the escape hatch.

## Decision

The curation escape hatch applies to **text-bearing files only**. A file
classified `binary` (content-based per `CONTEXT.md` — fails to decode, or matches
a binary media signature; this also covers a document whose text could not be
extracted) is **locked**: its tree row still renders, but the inclusion toggle
and the file-preview click are disabled, and a directory-level "include" skips it.
Binaries are no longer decoded to text at ingest — their entry carries empty
content — so even a programmatic force-include cannot leak bytes.

Noise, over-size Text, ambiguous, and pattern-excluded files stay **fully
re-includable**: they carry real text, so pulling them back is legitimate
curation, not a mistake. The lock keys on classification, nothing else.

## Considered and rejected

- **Keep the universal escape hatch, fix nothing.** Rejected: writing an image's
  decoded mojibake into an LLM bundle is the exact false-context harm ADR-0008
  rejected for the summary. Maximum user control is not worth shipping garbage the
  model then reasons over.
- **Drop binaries from the tree entirely.** Rejected for now: it changes the tree
  from "your folder's structure" to "the text subset," and hides that a binary
  even sits in a folder. A visible-but-locked row teaches *why* it is out. (Left
  as a reversible future option if binary-heavy folders make the tree noisy.)
- **Guard only at the output layer** — silently drop binary content while
  assembling the bundle. Rejected: the toggle would then lie. The UI would show
  the file "included" while the bundle omitted it. Locking the affordance keeps the
  UI honest about what will ship.

## Consequences

- The in-code "escape hatch for a one-off" comment is now **scoped**: escape hatch
  for text-bearing files; binaries excepted. `FileStatus` must carry
  `classification` so the tree can enforce the lock at render time.
- `CONTEXT.md`'s **Binary file** entry now states binaries are not manually
  re-includable. Glossary and this ADR must stay in sync.
- **Failed-extraction documents** (classification `binary`) are covered by the
  same rule. They currently never enter the tree at all, so they are locked *by
  absence* rather than by a visible lock. If the tree is ever built from
  validations instead of `entries`, they should render as locked rows for
  consistency.
- The result view keeps reporting binaries in its "aren't text, left out" card.
  That card gains **no** "adjust" action — there is nothing to adjust — which is
  why the finding-1 rework routes curation through a single section-level "Adjust
  what's included" button instead of a per-card one.
