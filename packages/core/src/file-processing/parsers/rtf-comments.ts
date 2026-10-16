import { SKIPPED } from "./msg-rtf";

/**
 * An RTF document with each comment written into its text as
 * `[Comment, author: body]` at the end of the paragraph it is on (Q24 O1),
 * and how many comments held text. A comment is the `\annotation` destination
 * after `\chatn`, its author the `\atnauthor` (else `\atnid`) group before
 * them (RTF 1.9.1, "Comments (Annotations)"); a `\atnparent` in it makes it a
 * reply. anydoc skips the destination, so the web lost every comment;
 * officeparser reads it itself and must not be given this.
 *
 * The label is built from the comment's own RTF, so the reader decodes its
 * characters as it decodes the rest; only paragraph and cell marks inside it
 * become spaces, keeping the label on its paragraph. The label opens with
 * `\plain`, so a paragraph ending in hidden text does not hide it.
 *
 * Runs before `withoutHiddenRtf`, so hidden text inside a comment goes too.
 * A file with no comment comes back as the same bytes.
 */
export function withRtfComments(rtf: Uint8Array): { bytes: Uint8Array; comments: number } {
  const edits: { at: number; parts: Uint8Array[] }[] = [];
  let pending: Uint8Array[] = [];
  let comments = 0;
  let author: Uint8Array | undefined;
  let initials: Uint8Array | undefined;
  // The group being collected (author, initials or a comment) and its depth.
  let open: { word: string; start: number; depth: number } | undefined;
  const destinations: boolean[] = [];
  let destination = false;
  let star = false;
  let first = false;
  let last = -1;

  for (const t of tokens(rtf)) {
    if (t.kind === "open") {
      destinations.push(destination);
      first = true;
      star = false;
      continue;
    }
    if (t.kind === "close") {
      if (open && destinations.length === open.depth) {
        const body = rtf.subarray(open.start, t.from);
        if (open.word === "atnauthor") author = body;
        else if (open.word === "atnid") initials = body;
        else {
          const flat = flatten(body);
          if (flat.text) {
            comments++;
            const by = author ?? initials;
            pending.push(
              ascii(`{\\plain  [${flat.reply ? "Reply" : "Comment"}`),
              by ? concat([ascii(", "), flatten(by).bytes]) : ascii(""),
              ascii(": "),
              flat.bytes,
              ascii("]}"),
            );
          }
          author = initials = undefined;
        }
        open = undefined;
      }
      destination = destinations.pop() ?? false;
      last = t.from;
      first = false;
      continue;
    }
    const wasFirst = first;
    first = false;
    if (t.kind === "star") {
      star = true;
      continue;
    }
    if (t.kind !== "word") continue;
    if (wasFirst || star) {
      if (!open && !destination && COLLECTED.has(t.word)) {
        open = { word: t.word, start: t.to, depth: destinations.length };
      }
      if (star || SKIPPED.has(t.word) || COLLECTED.has(t.word)) destination = true;
      star = false;
    }
    if (!destination && pending.length && ENDS_PARAGRAPH.has(t.word)) {
      edits.push({ at: t.from, parts: pending });
      pending = [];
    }
  }
  // A comment in the last paragraph, which has no mark after it.
  if (pending.length) edits.push({ at: last >= 0 ? last : rtf.length, parts: pending });
  if (edits.length === 0) return { bytes: rtf, comments };

  const parts: Uint8Array[] = [];
  let from = 0;
  for (const edit of edits) {
    parts.push(rtf.subarray(from, edit.at));
    for (const part of edit.parts) parts.push(part);
    from = edit.at;
  }
  parts.push(rtf.subarray(from));
  return { bytes: concat(parts), comments };
}

const COLLECTED = new Set(["atnauthor", "atnid", "annotation"]);
const ENDS_PARAGRAPH = new Set(["par", "sect", "cell", "nestcell"]);
/** Inside a label: marks that would end its line become spaces, `\pard` goes. */
const FLATTENED: Readonly<Record<string, string>> = {
  par: " ", line: " ", sect: " ", page: " ", cell: " ", nestcell: " ", row: " ", nestrow: " ", tab: " ", pard: "",
};

export const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A comment's RTF with its line-ending marks flattened, and whether it holds text or is a reply. */
export function flatten(rtf: Uint8Array): { bytes: Uint8Array; text: boolean; reply: boolean } {
  const parts: Uint8Array[] = [];
  let text = false;
  let reply = false;
  let depth = 0;
  // Depth of the nested destination skipped by the text check, if any.
  let skipping = -1;
  let star = false;
  let from = 0;
  for (const t of tokens(rtf)) {
    if (t.kind === "open") depth++;
    else if (t.kind === "close") {
      if (depth === skipping) skipping = -1;
      depth--;
    } else if (t.kind === "star") star = true;
    else if (t.kind === "word") {
      if (t.word === "atnparent") reply = true;
      if (star && skipping < 0) skipping = depth;
      star = false;
      const flat = FLATTENED[t.word];
      if (flat !== undefined) {
        parts.push(rtf.subarray(from, t.from), ascii(flat));
        from = t.to;
      } else if (t.word === "u" && skipping < 0) text = true;
    } else if (skipping < 0 && (t.kind === "hex" || !isSpace(rtf[t.from]))) text = true;
  }
  parts.push(rtf.subarray(from));
  return { bytes: concat(parts), text, reply };
}

type Token =
  | { kind: "open" | "close" | "star" | "hex" | "char"; from: number; to: number }
  | { kind: "word"; from: number; to: number; word: string };

/**
 * RTF's tokens as `rtfBody` reads them: a control word is at most 32 letters
 * and its number at most 10 digits, and `\binN` skips N bytes.
 */
export function* tokens(rtf: Uint8Array): Generator<Token> {
  for (let i = 0; i < rtf.length; ) {
    const c = rtf[i];
    if (c === 0x7b || c === 0x7d) {
      yield { kind: c === 0x7b ? "open" : "close", from: i, to: i + 1 };
      i++;
      continue;
    }
    if (c !== 0x5c) {
      if (c !== 0x0d && c !== 0x0a) yield { kind: "char", from: i, to: i + 1 };
      i++;
      continue;
    }
    const next = rtf[i + 1];
    if (next === 0x27) {
      yield { kind: "hex", from: i, to: Math.min(i + 4, rtf.length) };
      i += 4;
      continue;
    }
    if (!isLetter(next)) {
      if (next === 0x2a) yield { kind: "star", from: i, to: i + 2 };
      else if (next !== 0x0d && next !== 0x0a) yield { kind: "char", from: i, to: i + 2 };
      i += 2;
      continue;
    }
    let j = i + 1;
    while (j < rtf.length && j - i <= 32 && isLetter(rtf[j])) j++;
    const word = String.fromCharCode(...rtf.subarray(i + 1, j));
    let k = j;
    if (rtf[k] === 0x2d) k++;
    while (k < rtf.length && k - j <= 10 && rtf[k] >= 0x30 && rtf[k] <= 0x39) k++;
    const end = rtf[k] === 0x20 ? k + 1 : k;
    if (word === "bin") {
      const size = k > j ? parseInt(String.fromCharCode(...rtf.subarray(j, k)), 10) : 0;
      i = end + Math.max(0, Math.min(size, rtf.length - end));
      continue;
    }
    yield { kind: "word", from: i, to: end, word };
    i = end;
  }
}

const isLetter = (b: number) => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a);
const isSpace = (b: number) => b === 0x20 || b === 0x09;
