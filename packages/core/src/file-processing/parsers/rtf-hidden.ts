import { SKIPPED } from "./msg-rtf";

/**
 * An RTF document with its hidden text (`\v`, Q18 O1) and its tracked
 * deletions (`\deleted`) taken out before a reader sees it, and how many
 * hidden stretches held text. pandoc's RTF reader drops `\v` text the same
 * way. Control words, groups and paragraph marks stay, so the file still
 * parses and a hidden word does not fuse the paragraphs around it; only the
 * characters go. Destinations (`\*`, the font table, headers) are copied as
 * they are, since a style named in a hidden run is not text.
 *
 * A file with nothing to take out comes back as the same bytes.
 *
 * ponytail: direct formatting only; a paragraph hidden through a style with
 * `\v` in the stylesheet stays. Resolving `\sN` means reading the stylesheet.
 */
export function withoutHiddenRtf(rtf: Uint8Array): { bytes: Uint8Array; hidden: number } {
  const kept: [number, number][] = [];
  let from = 0;
  const drop = (start: number, end: number) => {
    if (start > from) kept.push([from, start]);
    from = end;
  };
  let group: Group = { hidden: false, deleted: false, destination: false, star: false };
  const stack: Group[] = [];
  let opened = false;
  let hidden = 0;
  let stretch = false;
  /** A token of text from `start` to `end`: dropped when hidden or deleted. */
  const text = (start: number, end: number) => {
    if (group.destination || !(group.hidden || group.deleted)) return;
    drop(start, end);
    if (group.hidden && !group.deleted && !stretch) hidden++;
    stretch = true;
  };

  for (let i = 0; i < rtf.length; ) {
    if (!group.hidden) stretch = false;
    const c = rtf[i];
    if (c === 0x7b || c === 0x7d) {
      if (c === 0x7b) stack.push(group);
      group = c === 0x7b ? { ...group, star: false } : (stack.pop() ?? group);
      opened = c === 0x7b;
      i++;
      continue;
    }
    const first = opened;
    opened = false;
    if (c !== 0x5c) {
      if (c !== 0x0d && c !== 0x0a) text(i, i + 1);
      i++;
      continue;
    }
    const next = rtf[i + 1];
    if (next === 0x27) {
      // \'hh: one byte in the code page.
      text(i, Math.min(i + 4, rtf.length));
      i += 4;
      continue;
    }
    if (!isLetter(next)) {
      // A control symbol: `\*` marks a destination, a line end is a paragraph
      // mark, and the rest (`\~`, `\-`, `\_`, `\\`, `\{`, `\}`) are text.
      if (next === 0x2a) group.star = true;
      else if (next !== 0x0d && next !== 0x0a) text(i, i + 2);
      i += 2;
      continue;
    }
    // A control word is at most 32 letters and its number at most 10 digits,
    // as `rtfBody` reads them.
    let j = i + 1;
    while (j < rtf.length && j - i <= 32 && isLetter(rtf[j])) j++;
    const word = String.fromCharCode(...rtf.subarray(i + 1, j));
    let k = j;
    if (rtf[k] === 0x2d) k++;
    while (k < rtf.length && k - j <= 10 && rtf[k] >= 0x30 && rtf[k] <= 0x39) k++;
    const param = k > j ? parseInt(String.fromCharCode(...rtf.subarray(j, k)), 10) : undefined;
    const end = rtf[k] === 0x20 ? k + 1 : k;

    if (word === "bin") {
      i = end + Math.max(0, Math.min(param ?? 0, rtf.length - end));
      continue;
    }
    if (group.star || (first && SKIPPED.has(word))) group.destination = true;
    group.star = false;
    if (word === "v") group.hidden = param !== 0;
    else if (word === "deleted") group.deleted = param !== 0;
    else if (word === "plain") group = { ...group, hidden: false, deleted: false };
    else if (TEXT_WORDS.has(word)) text(i, end);
    i = end;
  }
  if (kept.length === 0 && from === 0) return { bytes: rtf, hidden };
  if (from < rtf.length) kept.push([from, rtf.length]);
  const out = new Uint8Array(kept.reduce((sum, [start, end]) => sum + end - start, 0));
  let at = 0;
  for (const [start, end] of kept) {
    out.set(rtf.subarray(start, end), at);
    at += end - start;
  }
  return { bytes: out, hidden };
}

interface Group {
  hidden: boolean;
  deleted: boolean;
  /** Inside a destination: copied as it is. */
  destination: boolean;
  /** `\*` opened the group: the next control word names a destination. */
  star: boolean;
}

const isLetter = (b: number) => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a);

/**
 * Control words that stand for characters. `\uN` is one: its fallback
 * characters follow as text and go with it. Paragraph, cell, row and section
 * marks are structure and stay.
 */
const TEXT_WORDS = new Set([
  "u", "tab", "line", "lquote", "rquote", "ldblquote", "rdblquote", "emdash", "endash", "bullet",
  "emspace", "enspace", "qmspace", "zwj", "zwnj", "zwbo", "zwnbo", "chftn", "chdate", "chtime", "chpgn",
]);
