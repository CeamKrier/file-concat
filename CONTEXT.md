# FileConcat

FileConcat concatenates a set of input files into a single, LLM-ready text bundle, shipped as a web app and a CLI over a shared core. This glossary pins the terms that decide which files qualify and how the tool talks about them.

## Language

### File classification

**Text file**:
A file whose bytes decode to legible text under a standard encoding (UTF-8, UTF-16 LE/BE, UTF-32, or single-byte). Classification is content-based, not extension-based — an oddly-named text file still qualifies, and a mislabeled binary does not. Text files are always eligible for the bundle.
_Avoid_: "supported file", "code file" (docs, configs and data are text too)

**Binary file**:
A file whose bytes cannot be decoded to legible text (images, archives, executables, media, office documents). Detected by content, not by extension. Binary files are excluded from the bundle.
_Avoid_: "unsupported file", "invalid file"

**Ambiguous file**:
A file that decodes to partly-legible text — neither confidently text nor confidently binary (the narrow middle band of the printability check). FileConcat does its deterministic best and **includes it, flagged** ("might be binary"), so the user can drop it if the bundle shows garbage. Ambiguous files are never presumptively excluded.
_Avoid_: "corrupt file", "unknown file"

**Noise file**:
A file that is perfectly readable text but has near-zero value in an LLM bundle — lock files, build output, vendored dependencies, generated artifacts. Distinct from a Binary file (Noise _can_ be read; we just judge it not worth including). Excluded by a curated, ecosystem-aware default set, but always transparently surfaced and re-includable by the user.
_Avoid_: "junk", "excluded file", "skipped file" (too broad — those also cover binaries)
