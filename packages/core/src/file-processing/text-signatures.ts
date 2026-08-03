/**
 * Signatures for formats whose container *is* text.
 *
 * ADR-0011 put one decision point in front of everything: leading bytes decide
 * what a file is. Most formats announce themselves with a magic number, which
 * is what `file-type` reads. A few announce themselves just as unambiguously in
 * plain ASCII — a WebVTT file opens with `WEBVTT`, an SRT file with a cue index
 * and a timestamp range, a notebook with `{"cells": [{"cell_type": …`.
 *
 * Those are signatures too, and reading them here keeps the router's promise:
 * a transcript saved as `.txt` and a notebook saved as `.json` are recognized,
 * and no extension list comes back to decide it.
 *
 * The alternative — reshaping these after the byte classifier had already
 * called them text — would have needed a second decision point, its own
 * extension table, and its own way of telling the user what happened. Routing
 * them puts them on the path that already exists: a parser, a `{ text, notes }`
 * result, and the "included as extracted text" line in the summary.
 */

/** A text-shaped format the router can recognize. */
export type TextualFormat = "ipynb" | "srt" | "vtt";

/**
 * How much of the prefix is decoded. Every signature below sits at the very
 * start; the slack is for a notebook's `"cells"` key, which trails whatever
 * leading whitespace the writer used.
 */
const SNIFF_BYTES = 4096;

/**
 * `"cells": [` followed by evidence that this is a notebook and not some other
 * document with a `cells` field. `nbformat` covers an empty notebook, whose
 * cell array holds nothing to match on.
 */
const NOTEBOOK_CELLS = /^\uFEFF?\s*\{[\s\S]{0,2048}?"cells"\s*:\s*\[/;
const NOTEBOOK_EVIDENCE = /"(cell_type|nbformat)"\s*:/;

/**
 * A cue index on its own line, then a timestamp range. SubRip writes `,` as the
 * decimal separator and WebVTT writes `.`; both are accepted here because plenty
 * of tools emit the other one and the file is still unambiguous.
 */
const SRT_CUE =
  /^\uFEFF?\s*\d{1,6}[ \t]*\r?\n[ \t]*\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}[ \t]*-->[ \t]*\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}/;

/**
 * Decode the head of a file for signature matching, or `null` when it cannot be
 * one of these formats. A NUL byte early on is the cheap disqualifier: every
 * signature here is ASCII at offset zero, so a container that happens to carry
 * legible bytes never reaches the regexes.
 */
function decodeHead(prefix: Uint8Array): string | null {
  const scan = Math.min(prefix.length, 512);
  for (let i = 0; i < scan; i++) {
    if (prefix[i] === 0) return null;
  }
  // Non-fatal by default, so a multi-byte character cut in half by the prefix
  // boundary becomes U+FFFD rather than throwing.
  return new TextDecoder().decode(prefix.subarray(0, SNIFF_BYTES));
}

/** The text-shaped format this prefix announces, or `null` for anything else. */
export function matchTextualSignature(prefix: Uint8Array): TextualFormat | null {
  const head = decodeHead(prefix);
  if (head === null) return null;

  // `WEBVTT` may be followed by a header line ("WEBVTT - title"), so only the
  // boundary is checked, not the whole line.
  const vtt = head.replace(/^\uFEFF/, "");
  if (vtt.startsWith("WEBVTT") && (vtt.length === 6 || /[\s\r\n-]/.test(vtt[6]))) return "vtt";

  if (SRT_CUE.test(head)) return "srt";
  if (NOTEBOOK_CELLS.test(head) && NOTEBOOK_EVIDENCE.test(head)) return "ipynb";

  return null;
}
