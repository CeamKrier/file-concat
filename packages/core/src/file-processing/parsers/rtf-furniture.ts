import { strFromU8 } from "fflate";
import { SKIPPED } from "./msg-rtf";
import { ascii, concat, flatten, tokens } from "./rtf-comments";

/** `\header`, `\footer` and their left, right and first-page kinds (RTF 1.9.1, "Headers and Footers"). */
const REGION = /^(header|footer)[lrf]?$/;

/**
 * An RTF document with its page headers and footers written into the body
 * (C7), in the shape officeparser's path gives them: `--- Page header ---`
 * and its lines where the first header group sits, `--- Page footer ---` and
 * its lines at the end, each distinct region once, a region's paragraphs on
 * one line. anydoc skips the groups, so the web lost them; officeparser reads
 * them itself and must not be given this.
 *
 * Runs before `withoutHiddenRtf`, so hidden text in a header goes too. A file
 * that is no RTF, or has no header or footer holding text, comes back as the
 * same bytes.
 */
export function withRtfFurniture(rtf: Uint8Array): Uint8Array {
  // anydoc reads binary Office files too, which are no RTF.
  if (strFromU8(rtf.subarray(0, 5), true) !== "{\\rtf") return rtf;
  const found = { header: [] as Uint8Array[], footer: [] as Uint8Array[] };
  const seen = new Set<string>();
  let open: { kind: "header" | "footer"; start: number; depth: number } | undefined;
  let headerAt = -1;
  let group = 0;
  const destinations: boolean[] = [];
  let destination = false;
  let star = false;
  let first = false;
  let last = -1;

  for (const t of tokens(rtf)) {
    if (t.kind === "open") {
      destinations.push(destination);
      group = t.from;
      first = true;
      star = false;
      continue;
    }
    if (t.kind === "close") {
      if (open && destinations.length === open.depth) {
        const flat = flatten(rtf.subarray(open.start, t.from));
        // Compared as its words, so two kinds holding the same text under
        // different formatting are one.
        const key = strFromU8(flat.bytes, true)
          .replace(/\\[a-z]{1,32}-?\d{0,10} ?|[{}]/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (flat.text && !seen.has(key)) {
          seen.add(key);
          let end = flat.bytes.length;
          while (end > 0 && flat.bytes[end - 1] === 0x20) end--;
          found[open.kind].push(flat.bytes.subarray(0, end));
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
    if (t.kind !== "word" || !(wasFirst || star)) continue;
    const kind = REGION.exec(t.word)?.[1] as "header" | "footer" | undefined;
    if (kind && !open && !destination) {
      open = { kind, start: t.to, depth: destinations.length };
      if (headerAt < 0) headerAt = group;
    }
    if (star || kind || SKIPPED.has(t.word)) destination = true;
    star = false;
  }
  if (!found.header.length && !found.footer.length) return rtf;

  const block = (label: string, lines: Uint8Array[]) =>
    lines.length
      ? [ascii(`{\\pard\\plain ${label}\\par}`), ...lines.flatMap((line) => [ascii("{\\pard\\plain "), line, ascii("\\par}")])]
      : [];
  const end = last >= 0 ? last : rtf.length;
  return concat([
    rtf.subarray(0, headerAt),
    ...block("--- Page header ---", found.header),
    rtf.subarray(headerAt, end),
    ...block("--- Page footer ---", found.footer),
    rtf.subarray(end),
  ]);
}
