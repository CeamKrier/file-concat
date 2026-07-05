# Noise exclusion: a curated default set, plus the project's own .gitignore

FileConcat's guiding principle is that **no text file is excluded by a
presumptuous heuristic** — decodable text is included by default (see ADR-0001).
This ADR records the deliberate exception: FileConcat *does* presumptively
exclude **noise** — text that is perfectly readable but has near-zero value in an
LLM bundle (lock files, build output, vendored dependencies, generated
artifacts).

Noise is removed by a **unified set of two mechanisms** — the model the whole
category converged on (surveyed across Repomix, code2prompt, and the ripgrep
`ignore` crate); none of them detect "what ecosystem is this" and apply
per-language rules:

1. **A curated static default set** (`default-ignore.ts`) — the near-universal
   noise that is *often committed* and therefore absent from a project's
   `.gitignore`: lock files above all, plus common dependency/build/cache
   directories as a floor for drops that ship no `.gitignore` at all.
2. **Delegation to the project's own `.gitignore`** — the precise, elegant
   mechanism. The developer already declared their build / generated / secret
   directories; we honor them instead of guessing. This dissolves the
   cross-ecosystem collision problem (`target/`, `bin/`, `out/`): if the project
   ignores them we skip them, and if it doesn't, including them is defensible.

Both mechanisms are bound by two hard requirements so exclusion never becomes a
silent "guilty until proven innocent" filter:

1. **Transparent** — the result summary names what was skipped ("12 noise files
   skipped: lock files, build output") and lets the user restore it in one click.
2. **Honest narration** — the processing screen only claims to have skipped what
   it actually skipped; it never asserts "node_modules / lock files / js-ts" for a
   drop that contained none of them.

## Deliberately rejected: per-language detection

An earlier draft proposed detecting the ecosystem from marker files
(`pom.xml`, `*.csproj`, `Cargo.toml`, …) and gating generic directory names
behind them. A survey of the field killed it: static list + `.gitignore`
delegation is both simpler and *more* precise than any language-detection engine,
and it needs no project-type inference. Recording the rejection so a future
reader does not "improve" the ignore layer into a language detector.

## Surface-specific implementation notes

- **CLI** — walks with node-`glob` (not `globby`) plus an explicit `ignore`
  list. node-`glob` has no built-in `.gitignore` support, so honoring it means
  reading the project's `.gitignore` and matching through the `ignore` package
  (a new dependency). No sandbox constraints.
- **Web** — the `.gitignore` file is still collected into `entries` (hidden-file
  filtering only drops it from the *bundle*, not from ingestion), and `.git/` is
  pruned at walk time, so its content is readable from `entries`. The real cost
  is **hierarchical semantics**: a folder drop prefixes every path with the
  project directory, and nested `.gitignore` files apply only to their own
  subtree — so matching must strip the drop root and scope each `.gitignore` to
  its directory, not run one flat matcher. That correctness surface (per-subtree
  nesting, anchoring, `!` negation) is why this is a dedicated piece and needs
  the pure-JS `ignore` package rather than the match-anywhere `pathMatches`.

## Consequences

- A drop with no `.gitignore` falls back to the curated static floor, so that
  list must stay maintained — but it no longer needs to grow into an
  ever-expanding per-ecosystem catalog.
- Honoring `.gitignore` is also a **secret-hygiene bonus**: files like `.env`
  that live in `.gitignore` are excluded transitively, closing a leak path the
  static list alone would miss.
