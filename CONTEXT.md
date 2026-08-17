# FileConcat

FileConcat concatenates a set of input files into a single, LLM-ready text bundle, shipped as a web app and a CLI over a shared core. This glossary pins the terms that decide which files qualify and how the tool talks about them.

## Language

### File classification

**Text file**:
A file whose bytes decode to legible text under a standard encoding (UTF-8, UTF-16 LE/BE, UTF-32, or single-byte). Classification is content-based, not extension-based — an oddly-named text file still qualifies, and a mislabeled binary does not. Text files are always eligible for the bundle.
_Avoid_: "supported file", "code file" (docs, configs and data are text too)

**Binary file**:
A file whose bytes cannot be decoded to legible text and that carries no recoverable text either — images, archives, executables, media. Detected by content, not by extension: either the bytes fail to decode to legible text, or they open with a recognized binary media signature (so an image that leads with a large text metadata header is still binary — see ADR-0007). Membership tracks the **format**: a format leaves this set only when its text becomes recoverable in principle — at which point it is an Extractable document — never because a particular build happens to ship, or not ship, a reader for it. Binary files are excluded from the bundle. Because there is no recoverable text, a binary is **not manually re-includable** — the curation escape hatch that pulls a Noise or pattern-excluded Text file back into the bundle does not apply, since there is nothing to add. A binary whose pixels might hold writing can still be sent to **Recognition**, which is not curation and not an exception to that rule: it does not pull the file's bytes into the bundle, it produces new text and reclassifies the file when it succeeds. (Office documents are **not** binary in this sense — see Extractable document.)
_Avoid_: "unsupported file", "invalid file"

**Extractable document**:
A file whose format carries recoverable text that its own bytes do not spell out — PDF, Word (`.docx`), Excel (`.xlsx`), PowerPoint (`.pptx`), OpenDocument (`.odt`/`.ods`/`.odp`), and Rich Text (`.rtf`). Usually the container's bytes are not legible text at all; RTF is the exception that proves the rule, since its bytes decode perfectly well and yet spell out markup rather than the prose a reader would want. FileConcat extracts the text and includes the **extracted text** in the bundle (never the original bytes), and does so automatically wherever the environment allows. When extraction yields nothing — a scanned image-only or encrypted PDF — the file is treated as non-extractable and surfaced with a "couldn't extract text" flag, never silently dropped. Membership is a property of the **format**, not of which readers a given build ships or a user has enabled: when the reader for a format is missing, still loading, or switched off, the file surfaces with that same "couldn't extract text" flag — it is never quietly reclassified as a Binary file.
_Avoid_: "binary file" (its text is recoverable), "PDF support" / "parsing" (we include the extracted text, not the file)

**Recognition**:
Reading writing off pixels, as against extraction, which reads text a format already carries. Recognition is a **per-file attempt, never a format's promise**: a photographed receipt yields a page of text and a logo yields nothing, and only trying tells the two apart. That is why it is the one reading FileConcat never performs on a Binary file by itself — the user asks for it, over the files they pick. It applies in two places: a Binary file whose pixels might hold writing, and an Extractable document that gave up no text (a scan) or lost the pages whose fonts carry no character map. What comes back is a **guess** at the writing, close but not exact, so it is labeled as recognised and never presented as the file's own characters. A Binary file that recognition reads becomes a Text file for that Run and joins the bundle; one it cannot read is left exactly as it was, still binary, still locked.
_Avoid_: "extraction" (that one is deterministic and automatic, this is neither), "OCR" in user-facing copy, "scanning" (a scan is the input, recognition is the reading)

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

**Recording**:
One Microsoft Clarity session: a replay of on-screen activity held by a third party. A Recording is **coarser than a Visit** — it can span several page loads, and therefore several Visits and several Runs — and unlike a Visit it carries device and geography and can tell a returning visitor from a new one. It is the only unit that sees the routes which write no counters (`/docs`, `/blog`, `/privacy`), and the only one with history from before the counter table existed. Nothing links a Recording to a Run: that is a deliberate refusal, not a missing feature (ADR-0016).
_Avoid_: "session" on its own (it reads as Visit or Run, which are both narrower), "user", "replay of a Run"

**Session tag**:
A label attached to a Recording carrying a value from the counters' published vocabulary — the surface, the source, the size band, the kind of content we failed to read, the outcome. A Session tag exists so a Recording can be **found**, and is never a quantity: values accumulate over a Recording rather than describing it, so a tag says the Recording *contained* something, never that the Recording *was* it. Every number stays with the counters.
_Avoid_: "event" (Clarity events are a separate, per-occurrence thing), "metric", "counter" (a tag is a handle, not a measurement)

**Marker file**:
A file whose *name* is on a fixed, published list and identifies the ecosystem a drop came from — `package.json`, `go.mod`, `Cargo.toml`, `pom.xml` and their peers. Markers exist so that recognizing an ecosystem never requires looking at an arbitrary file name: only membership in the list is ever observed, never the name of a file outside it.
_Avoid_: "manifest" (too narrow), "config file" (most configs are not markers)
