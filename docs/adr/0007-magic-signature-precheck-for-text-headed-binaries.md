# Magic-signature pre-check for text-headed binary media

`classifyBytes` (the content classifier from ADR-0001) now checks the file's
leading bytes against a small table of binary media-container **magic
signatures** (PNG, JPEG, GIF, WEBP/RIFF, TIFF, ICO, PSD, ISO-BMFF `ftyp`)
*before* it decodes and scores printability. A signature hit returns `binary`
outright; everything else flows through the existing decode-and-suspicion path
unchanged. The table lives in `packages/core/src/file-processing/binary-signatures.ts`
and is consumed at the single chokepoint, so the web sniff path, the web
full-read path, and the CLI all inherit it.

## Why this is worth recording

ADR-0001 deliberately **rejected** a magic-byte registry, betting the
printability heuristic could recognize binaries dependency-free. That bet holds
for binaries whose bytes are high-entropy from offset zero. It fails for a
**binary with a large text header**: the suspicion ratio only scores the first
8 KB of decoded text, so if a container leads with kilobytes of legible metadata
the sample never reaches the compressed body and the file classifies as `text`.

This is not the exotic edge ADR-0001 knowingly accepted ("an unsigned, exotic
binary that happens to decode to mostly-printable bytes can slip in"). It is the
**common** case: every image exported by ChatGPT, DALL-E, and modern phone
cameras now prepends a multi-KB C2PA "Content Credentials" (caBX / JUMBF) or XMP
block before the image data. A user dropping a folder of AI-generated posters
saw them ingested as garbled `text`, directly breaking the "Images and binaries
skipped for you" promise. A future reader who sees a hand-rolled magic table
sitting in front of a content classifier — after ADR-0001 argued *against* one —
needs to know it exists specifically to close this blind spot, not to walk back
content-based classification.

## Considered options

- **Re-trust the extension denylist for known-binary extensions.** `png`/`jpg`
  are already in `BINARY_EXTENSIONS`; skipping the sniff when the extension
  matches would fix the reported case. Rejected: it reintroduces the
  extension-trust ADR-0001 removed, misses renamed and extensionless files, and
  the CLI reads bytes directly without a filename in hand at that point.
- **Widen the suspicion sample to the whole file.** Scoring all bytes, not the
  first 8 KB, would eventually reach the entropy. Rejected: it makes every text
  file pay a full-length scan to catch a minority of files, and still loses to a
  container whose *entire* payload is low-entropy.
- **Adopt the `file-type` dependency (the ADR-0001 rejForm).** A maintained magic
  registry covering hundreds of formats. Rejected for now: a ten-entry
  hand-rolled table covers the media containers that actually trigger this, stays
  dependency-free and isomorphic, and avoids a multi-format library on the hot
  path. Revisit if the format list grows past what a small table can carry.

## Consequences

- **The signature table is a maintenance surface.** New text-headed binary
  formats (e.g. a future image container) need an entry to be caught by content;
  until then they fall back to the printability heuristic and its blind spot. The
  table is intentionally scoped to media containers, not "all binaries."
- **Signatures must stay unambiguous against prose.** Every entry begins with a
  non-text byte or is long enough that a false positive on text is not credible;
  RIFF requires a form tag (WEBP/WAVE/AVI) so the word "RIFF" alone does not
  trip it. This constraint is why short 2-byte magics (e.g. BMP "BM") are omitted.
- **ADR-0001 still governs the default.** Anything without a known signature is
  classified exactly as before; the three-state text/binary/ambiguous model and
  the "never silently drop a user's text" bias are unchanged.
