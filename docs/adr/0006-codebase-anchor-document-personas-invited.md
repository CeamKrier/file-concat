# Codebase anchor, document personas invited

FileConcat was built and marketed as a tool for bundling a **codebase** for an
LLM. Client-side document extraction (ADR-0003) quietly broadened what the tool
is actually good at — people now drop folders of PDFs, contracts, and papers, not
just repos — but the positioning, wording, and landing page never followed. The
glossary (`CONTEXT.md`) had already de-coded its *file* vocabulary (it bans "code
file"; docs/configs/data are text; it defines **Extractable document**), yet the
product still presented itself as codebase-only. This ADR records the positioning
decision that closes that gap and anchors the work that follows from it.

## Decision

**Register B: keep the developer/codebase as the flagship, and invite the
document user as a first-class secondary persona.** Not a rebrand away from code —
the developer stays the hero (CLI, repo import, the whole shape). The document
user gets a named, welcomed seat rather than being an accommodated bystander.

Concretely:

- **Target personas for v1 dedicated pages:** Developer (flagship), Legal,
  Researcher.
  - *Legal* is the strongest document fit: born-digital contracts/rulings extract
    cleanly with no OCR, and "nothing uploaded, runs in your browser" **is**
    client confidentiality — the privacy brand was built for this persona.
  - *Researcher* has real search intent; its one honest caveat is scanned or
    two-column PDFs (the OCR gap, out of scope per ADR-0003).
- **Supported under the hood, no page yet:** writer/author, data analyst,
  student. The tool is reasonable for them, but they stay "works for you too" in a
  supporting section until search demand justifies a page. Student specifically
  waits because it leans hardest on the OCR gap.
- **Route shape:** the developer keeps the home route `/`; personas are **SEO
  satellite pages at `/for/<persona>`** (`/for/legal`, `/for/researchers`), not
  siblings under a neutered multi-persona hub.
- **Anti-thinness contract:** every persona page must carry (1) its own workflow
  narrative, (2) the actual file types that persona drops, (3) one concrete worked
  example (Legal → a case-file folder; Researcher → a lit-review folder), and
  (4) the persona-specific hook (Legal → privacy/confidentiality; Researcher →
  feeding a paper set to a model). Shared shell, bespoke body — thin doorway pages
  are both an SEO liability and a violation of the "no identical card grids" brand
  ban.

## Considered and rejected

- **Accommodated bystander (register A).** Keep the developer identity everywhere
  and only stop the output from *lying* (don't call a legal folder a codebase),
  with no marketing to document users. Rejected: the extraction engine (ADR-0003)
  is real investment that only pays off if the document user is actually invited;
  under A it stays a hidden Easter egg.
- **Full rebrand to a neutral "bundle any folder" tool.** Rejected: it throws away
  the developer identity that is the brand, the CLI, and the whole product shape.
  Broaden the invitation, keep the anchor.
- **A page per plausible persona (writer, data, student, …).** Rejected: thin,
  templated persona pages are penalized as doorway pages and read as AI slop.
  Three pages with real substance beat eight templated ones.

## Consequences

- This positioning is the premise ADR-0005 (content-adaptive root tag) cites: the
  output stops asserting "codebase" for non-code folders precisely because the
  document user is now a first-class persona.
- Downstream execution follows from this decision and is deliberately *not* an
  architectural choice: the `/for/*` page copy, the home rewording for register B
  (h1 / subhead / trust bullets), and the wording sweep that drops code-only
  framing (e.g. "default ignore patterns") for language a non-developer reads.
- The persona set is a living list. Adding a page later (writer, data) is cheap;
  the commitment recorded here is the *starting* set and the bar (the
  anti-thinness contract) any new page must clear.
