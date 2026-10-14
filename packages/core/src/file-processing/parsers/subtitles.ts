import type { ExtractionResult } from "./types";

/**
 * SubRip (`.srt`) and WebVTT (`.vtt`) captions, rendered as the transcript they
 * are.
 *
 * These already classified as text, so a bundle got them whole: a cue index and
 * a timestamp range for every one or two seconds of speech. On a machine-
 * generated caption track the scaffolding is most of the file, and the spoken
 * lines are repeated cue after cue as the caption rolls — an hour of video can
 * cost twenty thousand tokens to say a few thousand words.
 *
 * What comes out is the speech: no indices, no timestamps, no styling, and no
 * line repeated straight after itself. Timestamps are dropped rather than
 * thinned, because a transcript is read for what was said; if locating a moment
 * turns out to matter, that is a flag, not a different renderer.
 *
 * No dependency: both formats are line-oriented text.
 */

/** The named references WebVTT defines. Nothing else is a valid entity there. */
const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&lrm;": "",
  "&rlm;": "",
};

/**
 * The speaker a WebVTT voice tag names (`v Roger Bingham`, the tag less its
 * brackets), or undefined for any other tag.
 *
 * A voice span says who is speaking, and it is the
 * only place a caption track says it. Stripped along with the rest of the
 * markup, a two-person interview arrives as one undifferentiated monologue and
 * every attribution in it is unrecoverable — the same loss as a hyperlink whose
 * destination is thrown away, and invisible in the same way, since what is left
 * still reads as fluent speech.
 *
 * Kept as the label it already is. The optional classes (`<v.loud Roger>`) are
 * styling and go.
 */
function voice(tag: string): string | undefined {
  const space = tag.search(/\s/);
  const head = space < 0 ? tag : tag.slice(0, space);
  if (space < 0 || (head !== "v" && !head.startsWith("v."))) return undefined;
  return tag.slice(space).trim() || undefined;
}

/** Blocks that carry no speech: the WebVTT header and its metadata siblings. */
function isMetadataBlock(block: string): boolean {
  return /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(block);
}

/**
 * A cue line less its markup: WebVTT tags and timings, and SSA/ASS override
 * blocks (`{\an8}`), with a voice tag kept as its speaker's label. Read by
 * index, not by pattern: `<[^>]*>` rescans the rest of the line from every
 * unclosed `<`, and the voice pattern this replaced backtracked exponentially
 * on `<v.a.a.a...` (2026-10-15). An unclosed tag or block stays as text.
 */
function cleanLine(line: string): string {
  let out = "";
  let at = 0;
  // The next `<` and `{\` past `at`, -1 once none can close.
  let tag = line.indexOf("<");
  let block = line.indexOf("{\\");
  for (;;) {
    if (tag >= 0 && tag < at) tag = line.indexOf("<", at);
    if (block >= 0 && block < at) block = line.indexOf("{\\", at);
    const start = tag < 0 ? block : block < 0 ? tag : Math.min(tag, block);
    if (start < 0) break;
    const end = line.indexOf(start === tag ? ">" : "}", start);
    if (end < 0) {
      if (start === tag) tag = -1;
      else block = -1;
      continue;
    }
    out += line.slice(at, start);
    if (start === tag) {
      const speaker = voice(line.slice(start + 1, end));
      if (speaker) out += `${speaker}: `;
    }
    at = end + 1;
  }
  return (out + line.slice(at))
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (match) => ENTITIES[match] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the spoken text out of a caption track. Answers with empty text — the
 * contract's "couldn't extract" (ADR-0003) — when the file holds cues but no
 * words, so it surfaces as excluded instead of arriving as an empty entry.
 */
export function extractSubtitles(bytes: Uint8Array): ExtractionResult {
  const source = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");

  const cues: string[] = [];
  for (const block of source.split(/\n{2,}/)) {
    if (isMetadataBlock(block.trimStart())) continue;

    // A cue's scaffolding is its timing line and, directly above it, the
    // optional identifier. Position is what identifies the identifier: both
    // formats put it there and nowhere else, so a WebVTT cue labelled `intro`
    // is recognised for what it is instead of being read out as dialogue.
    //
    // Matching it by shape instead — SubRip's identifier is always a number —
    // is what this replaces, and that rule also deleted any cue whose whole
    // text was a number. Blocks are split on blank lines, so the line below is
    // never a gap.
    const blockLines = block.split("\n");
    for (let index = 0; index < blockLines.length; index++) {
      const line = blockLines[index].trim();
      if (!line || line.includes("-->") || blockLines[index + 1]?.includes("-->")) continue;
      cues.push(line);
    }
  }

  return { text: transcriptFromCues(cues) };
}

/**
 * The same transcript from cue payloads already taken out of their container,
 * as a video's embedded subtitle track yields them.
 */
export function transcriptFromCues(cues: readonly string[]): string {
  const lines: string[] = [];
  for (const cue of cues) {
    for (const line of cue.replace(/\r\n?/g, "\n").split("\n")) {
      const cleaned = cleanLine(line);
      // Rolling captions repeat the previous line in the next cue; a spoken
      // line that genuinely repeats back to back reads the same either way.
      if (cleaned && cleaned !== lines[lines.length - 1]) lines.push(cleaned);
    }
  }
  return lines.join("\n");
}
