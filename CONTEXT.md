# FileConcat

FileConcat concatenates a set of input files into a single, LLM-ready text bundle, shipped as a web app and a CLI over a shared core. This glossary pins the terms that decide which files qualify and how the tool talks about them.

## Language

### File classification

**Text file**:
A file whose bytes decode to legible text under a standard encoding (UTF-8, UTF-16 LE/BE, UTF-32, or single-byte). Classification is content-based, not extension-based — an oddly-named text file still qualifies, and a mislabeled binary does not. Text files are always eligible for the bundle.
_Avoid_: "supported file", "code file" (docs, configs and data are text too)

**Binary file**:
A file whose bytes cannot be decoded to legible text and that carries no recoverable text either — images, archives, executables, media. Detected by content, not by extension: either the bytes fail to decode to legible text, or they open with a recognized binary media signature (so an image that leads with a large text metadata header is still binary — see ADR-0007). Membership tracks the **format**: a format leaves this set only when its text becomes recoverable in principle — at which point it is an Extractable document — never because a particular build happens to ship, or not ship, a reader for it. Binary files are excluded from the bundle. Because there is no recoverable text, a binary is **not manually re-includable** — the curation escape hatch that pulls a Noise or over-size Text file back into the bundle does not apply, since there is nothing to add. (Office documents are **not** binary in this sense — see Extractable document.)
_Avoid_: "unsupported file", "invalid file"

**Extractable document**:
A file whose format carries recoverable text that its own bytes do not spell out — PDF, Word (`.docx`), Excel (`.xlsx`), PowerPoint (`.pptx`), OpenDocument (`.odt`/`.ods`/`.odp`), and Rich Text (`.rtf`). Usually the container's bytes are not legible text at all; RTF is the exception that proves the rule, since its bytes decode perfectly well and yet spell out markup rather than the prose a reader would want. FileConcat extracts the text and includes the **extracted text** in the bundle (never the original bytes), and does so automatically wherever the environment allows. When extraction yields nothing — a scanned image-only or encrypted PDF — the file is treated as non-extractable and surfaced with a "couldn't extract text" flag, never silently dropped. Membership is a property of the **format**, not of which readers a given build ships or a user has enabled: when the reader for a format is missing, still loading, or switched off, the file surfaces with that same "couldn't extract text" flag — it is never quietly reclassified as a Binary file.
_Avoid_: "binary file" (its text is recoverable), "PDF support" / "parsing" (we include the extracted text, not the file)

**Archive**:
A file whose bytes are a container of other **files** rather than a document carrying text — zip, tar, gzip, rar, 7z. FileConcat neither includes nor excludes an archive: it **expands** it, and every entry that falls out then faces the same classification as any other file. An archive FileConcat cannot open is surfaced by name, never silently dropped. The distinction from an Extractable document is what is recovered: an Extractable document yields **text**, an Archive yields **files**. Some formats share a container with both (an Office document is itself a zip), so the two are told apart by what the container holds, not by the container alone.
_Avoid_: "binary file" (its contents are recoverable), "extractable document" (we recover files from it, not text), "compressed file" (gzip of a single text file is still an Archive here)

**Ambiguous file**:
A file that decodes to partly-legible text — neither confidently text nor confidently binary (the narrow middle band of the printability check). FileConcat does its deterministic best and **includes it, flagged** ("might be binary"), so the user can drop it if the bundle shows garbage. Ambiguous files are never presumptively excluded.
_Avoid_: "corrupt file", "unknown file"

**Noise file**:
A file that is perfectly readable text but has near-zero value in an LLM bundle — lock files, build output, vendored dependencies, generated artifacts. Distinct from a Binary file (Noise _can_ be read; we just judge it not worth including). Excluded by a curated, ecosystem-aware default set, but always transparently surfaced and re-includable by the user.
_Avoid_: "junk", "excluded file", "skipped file" (too broad — those also cover binaries)

### Usage

**Run**:
One drop and everything that follows it until the next drop replaces it — the files that arrived, the curation applied to them, the bundle produced, and any number of exports taken from that bundle. A Run is the unit every usage question is asked about: "how large was it", "how long did it take", "was it abandoned" are all properties of a Run, never of a Visit. A Run that produces a bundle nobody exports is **abandoned**, and an abandoned Run is as much a measurement as a completed one.
_Avoid_: "session", "upload" (nothing is uploaded), "job"

**Visit**:
One load of a document that hosts the tool. A Visit contains zero or more Runs, and a Visit with zero Runs is a **bounce**. Visits carry an identity that lives only as long as the page is open, so the Runs inside one Visit read as a sequence while nothing links a Visit to another Visit or to a person. Repeat use is therefore observable **within** a Visit and deliberately invisible across them.
_Avoid_: "user", "session", "visitor" (all imply an identity that outlives the page)

**Marker file**:
A file whose *name* is on a fixed, published list and identifies the ecosystem a drop came from — `package.json`, `go.mod`, `Cargo.toml`, `pom.xml` and their peers. Markers exist so that recognizing an ecosystem never requires looking at an arbitrary file name: only membership in the list is ever observed, never the name of a file outside it.
_Avoid_: "manifest" (too narrow), "config file" (most configs are not markers)
