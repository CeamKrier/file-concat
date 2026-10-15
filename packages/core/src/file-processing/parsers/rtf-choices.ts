import { strFromU8 } from "fflate";
import { SKIPPED } from "./msg-rtf";
import { ascii, concat, tokens } from "./rtf-comments";
import { symbolFontChar } from "./symbol-font";

/**
 * An RTF document with the choices RTF 1.9.1 leaves to a reader made before
 * anydoc reads it (N19), which otherwise writes both sides or the wrong one:
 *
 * - `{\upr{ansi}{\*\ud{unicode}}}` keeps the Unicode copy, as the spec tells
 *   a Unicode reader to.
 * - `{\nonesttables ...}`, the text a reader without nested tables shows in
 *   their place, goes: anydoc reads the nested table itself.
 * - A drop-down form field's empty result gets the item Word shows: the
 *   `\ffl` item `\ffres` picks, or `\ffdefres` when `\ffres` is 25 (none).
 * - A character in a run whose font the font table names Symbol (a `\uN` at
 *   U+F0xx, a `\'hh` or a plain byte) becomes the character it draws, as the
 *   docx and .doc readers write a Symbol-font character (`symbolFontChar`).
 *
 * A file that is no RTF, or holds none of these, comes back as the same bytes.
 *
 * ponytail: Symbol only, as `symbolFontChar` is; a `\uN` at U+F0xx in a font
 * the table does not name stays as anydoc writes it.
 */
export function withRtfChoices(rtf: Uint8Array): Uint8Array {
  if (strFromU8(rtf.subarray(0, 5), true) !== "{\\rtf") return rtf;
  const edits: { from: number; to: number; insert: Uint8Array }[] = [];
  const fonts = new Map<number, string>();
  let defaultFont: number | undefined;
  let group: Group = { from: 0, star: false, destination: false, uc: 1, text: false, children: 0 };
  const stack: Group[] = [];
  let first = false;
  // The fallback characters a `\uN` is followed by, which a reader skips.
  let fallback = 0;

  const symbol = (code: number): string | undefined =>
    !group.destination && group.font !== undefined && /^symbol$/i.test(fonts.get(group.font) ?? "") ? symbolFontChar("Symbol", code) : undefined;
  // A `\uN` keeps the fallback after it; a byte gets one, as many as `\uc` says a reader skips.
  const asUnicode = (from: number, to: number, char: string, word: boolean) =>
    edits.push({ from, to, insert: ascii(`\\u${char.charCodeAt(0)}${word ? " " : "?".repeat(Math.min(group.uc, MAX_FALLBACK))}`) });

  for (const t of tokens(rtf)) {
    if (t.kind === "open") {
      stack.push(group);
      const parent = group;
      parent.children++;
      group = { ...parent, from: t.from, first: undefined, star: false, parent, text: false, children: 0 };
      // The first group inside `\upr` is the ANSI copy.
      if (parent.first === "upr" && parent.children === 1) group.dropped = true;
      first = true;
      fallback = 0;
      continue;
    }
    if (t.kind === "close") {
      const closed = group;
      group = stack.pop() ?? group;
      first = false;
      fallback = 0;
      if (closed.first === "fonttbl") readFonts(strFromU8(rtf.subarray(closed.from, t.to), true), fonts);
      // An empty group in its place, so a control word before it does not run into the text after.
      else if (closed.first === "nonesttables" || closed.dropped) edits.push({ from: closed.from, to: t.to, insert: ascii("{}") });
      else if (closed.first === "ffl" && closed.parent?.form) closed.parent.form.items.push(rtf.subarray(closed.itemFrom ?? t.from, t.from));
      else if (closed.first === "fldrslt" && !closed.text && closed.field?.form?.type === 2) {
        const { res, defres, items } = closed.field.form;
        const item = items[res === 25 ? defres : res];
        // Once per field, so a forged run of empty results cannot repeat a long item.
        if (item) edits.push({ from: t.from, to: t.from, insert: item });
        closed.field.form.items = [];
      }
      if (closed.text && closed.parent) closed.parent.text = true;
      continue;
    }
    // `\*` comes before the word that names a destination.
    if (t.kind === "star") {
      group.star = true;
      group.starAt = t.from;
      continue;
    }
    const opened = first;
    first = false;
    if (t.kind === "word") {
      const word = t.word;
      const param = /-?\d+/.exec(strFromU8(rtf.subarray(t.from + 1 + word.length, t.to), true))?.[0];
      const value = param === undefined ? undefined : parseInt(param, 10);
      if (opened) {
        group.first = word;
        if (group.star || SKIPPED.has(word)) group.destination = true;
        if (word === "field") group.field = {};
        else if (word === "formfield" && group.parent) {
          // The form field's settings belong to the field the instruction sits in.
          const field = group.field;
          if (field) field.form = { type: 0, res: 25, defres: 0, items: [] };
          group.form = field?.form;
        } else if (word === "ffl") group.itemFrom = t.to;
        else if (word === "ud" && group.star && group.parent?.first === "upr") {
          // Read as text: drop `\*\ud`, keep the group's contents.
          edits.push({ from: group.starAt ?? t.from, to: t.to, insert: new Uint8Array() });
          group.destination = group.parent.destination;
        }
      }
      group.star = false;
      if (word === "deff" && value !== undefined) defaultFont = value;
      else if (word === "f" && value !== undefined) group.font = value;
      else if (word === "plain") group.font = defaultFont;
      else if (word === "uc" && value !== undefined) group.uc = Math.max(0, value);
      else if (word === "fftype" && group.form && value !== undefined) group.form.type = value;
      else if (word === "ffres" && group.form && value !== undefined) group.form.res = value;
      else if (word === "ffdefres" && group.form && value !== undefined) group.form.defres = value;
      else if (word === "u" && value !== undefined) {
        group.text = true;
        const code = value < 0 ? value + 0x10000 : value;
        const char = code >= 0xf020 && code <= 0xf0ff ? symbol(code) : undefined;
        if (char) asUnicode(t.from, t.to, char, true);
        fallback = group.uc;
      } else if (TEXT_WORDS.has(word)) group.text = true;
      continue;
    }
    // A character or `\'hh`: a `\uN`'s fallback, or text.
    if (fallback > 0) {
      fallback--;
      continue;
    }
    if (group.destination) continue;
    group.text = true;
    const code = t.kind === "hex" ? parseInt(strFromU8(rtf.subarray(t.from + 2, t.to), true), 16) : t.to - t.from === 1 ? rtf[t.from] : undefined;
    const char = code !== undefined && code >= 0x20 && !Number.isNaN(code) ? symbol(code) : undefined;
    if (char && char !== String.fromCharCode(code ?? 0)) asUnicode(t.from, t.to, char, false);
  }
  if (!edits.length) return rtf;
  edits.sort((a, b) => a.from - b.from || a.to - b.to);
  const parts: Uint8Array[] = [];
  let at = 0;
  for (const edit of edits) {
    // An edit inside a dropped group is gone with it.
    if (edit.from < at) continue;
    parts.push(rtf.subarray(at, edit.from), edit.insert);
    at = edit.to;
  }
  parts.push(rtf.subarray(at));
  return concat(parts);
}

interface Form {
  /** `\fftype`: 0 text, 1 check box, 2 drop-down. */
  type: number;
  res: number;
  defres: number;
  items: Uint8Array[];
}

interface Group {
  from: number;
  /** The control word the group opens with. */
  first?: string;
  star: boolean;
  starAt?: number;
  destination: boolean;
  font?: number;
  uc: number;
  parent?: Group;
  /** The `\field` the group sits in, and the form field its instruction holds. */
  field?: { form?: Form };
  form?: Form;
  /** Where a `\ffl` item's text starts. */
  itemFrom?: number;
  /** Holds text of its own or in a group inside it. */
  text: boolean;
  children: number;
  dropped?: boolean;
}

/** Word writes `\uc1` or `\uc2`; a forged `\uc` must not turn one byte into a billion. */
const MAX_FALLBACK = 8;

/** Control words that stand for characters, so a result holding one is not empty. */
const TEXT_WORDS = new Set(["tab", "line", "lquote", "rquote", "ldblquote", "rdblquote", "emdash", "endash", "bullet", "emspace", "enspace"]);

/** A font table's entries, `\fN ... Name;` each, braced or not. */
function readFonts(table: string, fonts: Map<number, string>) {
  for (const entry of table.replace(/^\{\\fonttbl/, "").split(";")) {
    const id = /\\f(\d+)/.exec(entry)?.[1];
    const name = entry
      .replace(/\{\\\*[^{}]*\}/g, "")
      .replace(/\\'[0-9a-f]{2}/gi, "")
      .replace(/\\[a-z]{1,32}-?\d{0,10} ?/gi, "")
      .replace(/[{}]/g, "")
      .trim();
    if (id !== undefined && name && !fonts.has(Number(id))) fonts.set(Number(id), name);
  }
}
