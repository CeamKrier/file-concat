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
export type TextualFormat = "ipynb" | "srt" | "vtt" | "eml" | "html";

/**
 * How much of the prefix is decoded: all the router reads. Every signature
 * below sits at the very start, but an email's header block does not end
 * there: behind a long Received/ARC chain `From:` sits 4 to 6 KB in (a bounce
 * and a calendar invite in the 2026-10-05 mail sample).
 */
const SNIFF_BYTES = 8192;

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

/** An RFC 5322 field line: a printable name, a colon, then the value. */
const HEADER_LINE = /^[!-9;-~]+:/;

/**
 * Header names that only a real message carries. A file may well open with
 * `From:` and `To:` without being an email — YAML, config, a template — so a
 * message is recognized by its envelope, which nothing else writes by accident.
 */
const ENVELOPE_HEADERS = new Set([
  "received",
  "message-id",
  "mime-version",
  "return-path",
  "delivered-to",
]);

/**
 * A well-formed RFC 5322 header block with an envelope in it. Continuation
 * lines (leading whitespace) belong to the field above; anything else before
 * the blank line that ends the block disqualifies the file outright, which is
 * what keeps a `key: value` config out.
 */
function looksLikeEmail(head: string): boolean {
  let hasFrom = false;
  let hasEnvelope = false;

  const lines = head.split("\n");
  // The prefix can end inside the header block, mid-line; that cut line is not
  // judged, so the decision rests on the fields that arrived whole.
  lines.pop();
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line === "") break; // end of the header block
    if (/^[ \t]/.test(line)) continue; // folded continuation

    if (!HEADER_LINE.test(line)) return false;
    const name = line.slice(0, line.indexOf(":")).toLowerCase();
    if (name === "from") hasFrom = true;
    if (ENVELOPE_HEADERS.has(name)) hasEnvelope = true;
  }

  return hasFrom && hasEnvelope;
}

/**
 * The comment a page saver writes, and the address of the page it saved.
 * Chromium's "Webpage, Complete" puts `<!-- saved from url=(0040)https://... -->`
 * before `<html>` (`frame_serializer.cc`); SingleFile puts "Page saved with
 * SingleFile" and a `url:` line as the first child of `<html>`. Firefox writes
 * nothing, so a page it saved is read as source, as every `.html` was before.
 *
 * Only a saved page is routed, never HTML as such: a template or a component
 * in a repository is source, and its markup is the content. Measured
 * 2026-10-05: 0 of 346 `.html` files under node_modules carry either comment.
 */
const SAVED_PAGE =
  /<!--\s*(?:saved from url=\(\d{4}\)(https?:[^\s>]+)|(?:Page saved with|Archive processed by) SingleFile\s+url: (\S+))/i;

/**
 * The address a saved page came from, or `undefined` when the head carries no
 * saver comment. Looked for before `<head` or `<body`, where both savers put
 * it, so a page that merely quotes the comment in its text is not taken.
 */
export function savedPageUrl(head: string): string | undefined {
  const scan = head.slice(0, SNIFF_BYTES);
  const end = scan.search(/<(head|body)[\s>]/i);
  const match = SAVED_PAGE.exec(end < 0 ? scan : scan.slice(0, end));
  return match ? (match[1] ?? match[2]) : undefined;
}

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
  if (looksLikeEmail(head)) return "eml";
  if (savedPageUrl(head)) return "html";

  return null;
}
