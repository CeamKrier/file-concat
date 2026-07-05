# Content-based, multi-encoding text classification

FileConcat decides whether an input file belongs in the bundle by **reading its
bytes**, not by trusting its extension. A single shared `readAsText` helper in
`@fileconcat/core` detects the encoding (BOM → UTF-8/16LE/16BE/32; otherwise the
alternating-NUL pattern that marks BOM-less UTF-16), decodes accordingly, and
classifies the result into one of three states:

- **text** — decodes to legible text → included.
- **binary** — cannot be decoded to legible text (images, archives, executables,
  media, office docs) → excluded.
- **ambiguous** — the narrow middle band where the printability ratio is neither
  clearly text nor clearly binary → **included and flagged** ("might be binary"),
  so the user can drop it if the bundle shows garbage.

Both classification *and* content reading go through the same helper, so a
UTF-16 source file is decoded correctly instead of being read as UTF-8 mojibake.
Today the two consumers diverge — the web sniffs bytes for a NUL and calls a
UTF-16 file "binary", while the CLI trusts an extension denylist and reads
everything as UTF-8 (so it keeps the file but mojibakes it). Both will adopt
this one core helper, replacing their divergent logic so they classify and
decode identically.

## Why this is worth recording

The previous rule was the "obvious" one — any NUL byte in the first 8 KB means
binary. That silently rejected whole folders of UTF-16-encoded `.java`/`.cs`
files as "Nothing text-like to combine." A future reader will see us transcoding
UTF-16 and *including files that look partly binary* and wonder why we didn't
just keep the simple NUL sniff.

## Considered options

- **Keep the NUL sniff, add a UTF-16 escape hatch.** Closes the reported ticket,
  not the next exotic-encoding one. Rejected.
- **Magic-byte binary registry (`file-type`).** Would add a dependency (it is not
  a direct dep today) for a "recognized-binary → skip" model. Achievable with the
  printability heuristic instead, dependency-free. Rejected for now.

## Consequences

- An unsigned, exotic binary that happens to decode to mostly-printable bytes can
  slip into the bundle as "text." Accepted deliberately: the product errs toward
  *never dropping a user's text* over *never including junk*, and the ambiguous
  flag plus the visible preview make any such slip obvious and one-click
  reversible.
- The ambiguous band must stay **narrow** — if the flag fires often it becomes
  noise rather than signal.
