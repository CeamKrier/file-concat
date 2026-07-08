# The bundle's root tag names what it holds — codebase, documents, or files

FileConcat began as a codebase-bundling tool, and its output hard-codes that
origin: every bundle is wrapped in `<codebase>`, and the summary opens "This is a
packed snapshot of a **codebase**." That was fine while the only input was a repo.
It is no longer: client-side document extraction (ADR-0003) means people now drop
folders of PDFs, contracts, and papers — a real legal case folder comes out as
`<codebase project="dava-1-iptal-karar">`, which is simply false. ADR-0006 decided
to keep the developer/codebase as the flagship persona but **invite the document
user as a first-class secondary persona**, and mislabeling their folder a
"codebase" contradicts that invitation.

## Decision

The output **root tag and the summary noun adapt to the dominant content** of the
bundle, chosen by a deterministic classifier over the file set:

- Every file votes into one bucket:
  - **CODE** — a recognized programming language (source files).
  - **DOC** — an extractable document (`pdf`/`docx`/`xlsx`/`pptx`/`odf`) **or**
    prose (`md`/`txt`/`rst`).
  - **OTHER** — config, data, unknown text (`json`/`yaml`/`csv`/`xml`/lock, …).
    Abstains; it never wins the tag.
- Tag by plurality of CODE vs DOC, **by file count**; a tie or an all-OTHER
  bundle falls through to neutral:

  ```
  CODE > DOC  → <codebase>   / "a codebase"
  DOC  > CODE → <documents>  / "a set of documents"
  else        → <files>      / "a set of files"
  ```

- The markdown `# Codebase:` and plain `Codebase:` headers follow the same word.
- Independently, the summary's exclusion line drops gitignore jargon ("default
  ignore patterns") for language a non-developer can read ("skipped: images and
  other binaries, plus common noise like lock files and build output").

This is content-dependent but **fully deterministic** — a pure function of the
file set, with no clock, randomness, or order-dependence — so it preserves
ADR-0001's determinism guarantee: the same folder always produces the same tag.

## Considered and rejected

- **Keep `<codebase>` always.** The zero-effort option, but it directly
  contradicts the decision to invite document users — it calls a legal folder a
  codebase. Rejected once that positioning was chosen.
- **One neutral tag always** (`<bundle>` / `<files>`). Honest everywhere and the
  simplest change, but it throws away a genuinely useful signal: for a real repo,
  telling the consuming model "this is source code" is worth keeping. Adapting is
  strictly more informative than flattening.
- **Byte- or token-weighted classification.** More faithful to "what the bundle
  is mostly made of," but less predictable for the user and heavier to compute.
  File-count is simpler and its verdict is obvious from the file list.
- **Markdown/prose votes OTHER (abstains).** Considered, so only office/PDF files
  could pull a bundle toward `<documents>`. Rejected: under the document-user
  positioning a folder of prose *is* documents, and a writer's `.md` manuscript or
  a pure docs site deserves `<documents>` over a bare `<files>`. The cost is that
  a markdown-heavy code repo can read as `<documents>`, which is bounded because
  real source usually outnumbers its markdown.

## Consequences

- The root tag is no longer a fixed string a downstream prompt or script can
  hard-code; anything keying on `<codebase>` must accept `<documents>` and
  `<files>` too. Acceptable — the tag is an LLM-facing delimiter/hint, not a
  parser contract (ADR consumers already treat file content as verbatim, not
  strict XML).
- A docs-heavy code repo (more markdown than source) is classified `<documents>`.
  This is the deliberate edge of the markdown→DOC choice above, accepted for the
  writer/docs personas it serves.
- The classifier reuses the per-file language detection the tool already runs, so
  it adds no new scanning pass — only a bucket tally.
