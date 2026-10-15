import { listLabels, type ListDefinition, type ListInstance, type ListLevel } from "./office-lists";
import type { CfbStreams } from "./msg";
import { SUMMARY_INFORMATION, summaryTitle } from "./title";
import type { ExtractionNote, ExtractionResult } from "./types";

/**
 * Word 97-2003 documents (`.doc`, MS-DOC), the text only.
 *
 * The `WordDocument` stream opens with the FIB, which says where the text
 * lives: not in one run but in pieces, listed in the piece table (the CLX in
 * the `0Table` or `1Table` stream, whichever the FIB names). Each piece is a
 * range of characters at an offset in `WordDocument`, stored either as UTF-16
 * or as 8-bit Windows-1252 with the offset halved; a fast-saved document is
 * nothing but pieces out of order, which is why the table cannot be skipped.
 *
 * The character stream is the main body, then footnotes, headers, comments,
 * endnotes and text boxes, each of a length the FIB gives. The body, the
 * notes and the text boxes are kept. Headers and footers are written once
 * each, labelled, before and after the body as a docx's are (C7). Comments
 * are written into the body at the end of their paragraph (Q24 O1), and a
 * list paragraph opens with the label Word prints for it (C8).
 *
 * Only the reading lives here, over streams already lifted out of the
 * container (ADR-0012); the browser opens it with the library that reads a
 * 97-2003 workbook. Word 6 and 95 files carry an older table and are
 * declined with `parser-unavailable`, so the ledger names them and says
 * what would get them read; a password-protected one throws, and is named as
 * such.
 */

const WORD_97 = 0x00c1;

/** Control characters Word writes into the text. */
const PARAGRAPH = 0x0d;
const CELL_MARK = 0x07;
const LINE_BREAK = 0x0b;
const PAGE_BREAK = 0x0c;
const FIELD_BEGIN = 0x13;
const FIELD_SEPARATOR = 0x14;
const FIELD_END = 0x15;

/** sprmCFRMarkDel (MS-DOC 2.6.1): the run is a tracked deletion. */
const SPRM_DELETED = 0x0800;
/** sprmCFVanish (MS-DOC 2.6.1): the run is hidden text. */
const SPRM_HIDDEN = 0x083c;
/**
 * Stands in for each character of hidden text, so the text keeps its length
 * and the FIB's part lengths still slice it. A 0x10 the file itself holds is
 * read as NUL first; Word never writes one.
 */
const HIDDEN = 0x10;

/**
 * `WordDocument` with the bytes of its tracked deletions zeroed, read from the
 * character property pages (PlcBteChpx, then each ChpxFkp). POI exposes the
 * same flag as `CharacterRun.isMarkedDeleted()`, and Tika leaves those runs
 * out unless asked for deleted content. A zeroed character reads as NUL, which
 * `plain` drops, so the FIB's part lengths still slice the text.
 *
 * Pages and runs are in ascending order in a sound file, so a range is only
 * zeroed past the last one: a forged file that repeats a page or overlaps its
 * runs loses a deletion, never costs more than one pass over the stream.
 *
 * Hidden text (Q18 O1) comes back as byte ranges instead, kept in the same
 * order, because only the piece that holds a range knows how wide its
 * characters are, and a hidden paragraph or cell mark still has to end its
 * paragraph or cell. POI calls the flag `CharacterRun.isVanished()`.
 *
 * ponytail: the flag is read from the run's own properties only; a deletion
 * set through a character style (operand 0x80/0x81) is taken as on for 0x81.
 */
function withoutDeletions(word: Uint8Array, table: Uint8Array): { word: Uint8Array; hidden: [number, number][] } {
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const fcPlc = fib.getUint32(0x00fa, true);
  const lcbPlc = fib.getUint32(0x00fe, true);
  const hidden: [number, number][] = [];
  if (lcbPlc < 8 || fcPlc + lcbPlc > table.byteLength) return { word, hidden };
  const plc = new DataView(table.buffer, table.byteOffset + fcPlc, lcbPlc);
  const pages = Math.floor((lcbPlc - 4) / 8);
  const seen = new Set<number>();
  let out = word;
  let zeroed = 0;
  for (let page = 0; page < pages; page++) {
    const base = (plc.getUint32((pages + 1) * 4 + page * 4, true) & 0x3fffff) * 512;
    if (base + 512 > word.byteLength || seen.has(base)) continue;
    seen.add(base);
    const fkp = new DataView(word.buffer, word.byteOffset + base, 512);
    const runs = fkp.getUint8(511);
    if (runs * 5 + 4 > 511) continue;
    for (let run = 0; run < runs; run++) {
      const chpx = fkp.getUint8((runs + 1) * 4 + run) * 2;
      if (chpx === 0 || chpx >= 511) continue;
      const end = Math.min(511, chpx + 1 + fkp.getUint8(chpx));
      // A grpprl is a run of sprms: a 2-byte code whose top three bits say
      // how long the operand is (MS-DOC 2.2.5.1).
      for (let at = chpx + 1; at + 2 <= end; ) {
        const sprm = fkp.getUint16(at, true);
        at += 2;
        const size = [1, 1, 2, 4, 2, 2, -1, 3][sprm >>> 13];
        const on = at < end && (fkp.getUint8(at) === 1 || fkp.getUint8(at) === 0x81);
        if (sprm === SPRM_DELETED && on) {
          const from = Math.max(fkp.getUint32(run * 4, true), zeroed);
          const to = Math.min(fkp.getUint32((run + 1) * 4, true), word.byteLength);
          if (from < to) {
            if (out === word) out = word.slice();
            out.fill(0, from, to);
            zeroed = to;
          }
        } else if (sprm === SPRM_HIDDEN && on) {
          const from = Math.max(fkp.getUint32(run * 4, true), hidden[hidden.length - 1]?.[1] ?? 0);
          const to = Math.min(fkp.getUint32((run + 1) * 4, true), word.byteLength);
          if (from < to) hidden.push([from, to]);
        }
        at += size < 0 ? (at < end ? fkp.getUint8(at) + 1 : 1) : size;
      }
    }
  }
  return { word: out, hidden };
}

/** A run of characters and where its bytes sit in `WordDocument`, one or two per character. */
interface Piece {
  cp: number;
  end: number;
  offset: number;
  width: number;
}

function readPieces(document: Uint8Array, table: Uint8Array): { text: string; pieces: Piece[] } {
  const { word, hidden } = withoutDeletions(document, table);
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const fcClx = fib.getUint32(0x01a2, true);
  const lcbClx = fib.getUint32(0x01a6, true);
  if (fcClx + lcbClx > table.byteLength) return { text: "", pieces: [] };
  const clx = new DataView(table.buffer, table.byteOffset + fcClx, lcbClx);

  // The CLX is a run of property modifiers (0x01, then a 2-byte length) and
  // then the piece table itself (0x02, then a 4-byte length).
  let at = 0;
  while (at < lcbClx && clx.getUint8(at) === 0x01) at += 3 + clx.getUint16(at + 1, true);
  if (at >= lcbClx || clx.getUint8(at) !== 0x02) return { text: "", pieces: [] };
  const lcbPlc = clx.getUint32(at + 1, true);
  const plc = at + 5;
  const count = Math.floor((lcbPlc - 4) / 12);

  // A leading U+FEFF is text here: dropped, it would shift every part after it.
  const utf16 = new TextDecoder("utf-16le", { ignoreBOM: true });
  const ansi = new TextDecoder("windows-1252");
  let text = "";
  const pieces: Piece[] = [];
  for (let piece = 0; piece < count; piece++) {
    const start = clx.getUint32(plc + piece * 4, true);
    const end = clx.getUint32(plc + (piece + 1) * 4, true);
    const fc = clx.getUint32(plc + (count + 1) * 4 + piece * 8 + 2, true);
    const compressed = (fc & 0x40000000) !== 0;
    const offset = compressed ? (fc & 0x3fffffff) >>> 1 : fc & 0x3fffffff;
    const length = (end - start) * (compressed ? 1 : 2);
    if (offset + length > word.byteLength) break;
    const bytes = word.subarray(offset, offset + length);
    const read = (compressed ? ansi.decode(bytes) : utf16.decode(bytes)).split(String.fromCharCode(HIDDEN)).join("\0");
    pieces.push({ cp: text.length, end: text.length + read.length, offset, width: compressed ? 1 : 2 });
    text += hide(read, offset, compressed ? 1 : 2, hidden);
  }
  return { text, pieces };
}

/**
 * `text`, read from the bytes at `offset`, with each character inside a hidden
 * range read as HIDDEN. Control characters stay, so a hidden paragraph mark
 * still ends its paragraph and a hidden field keeps its structure. One index
 * per UTF-16 code unit or 8-bit byte, so a range maps straight onto the string.
 */
function hide(text: string, offset: number, width: number, hidden: [number, number][]): string {
  const end = offset + text.length * width;
  // The ranges ascend without overlap: find the first that ends past `offset`.
  let low = 0;
  for (let high = hidden.length; low < high; ) {
    const middle = (low + high) >>> 1;
    if (hidden[middle][1] <= offset) low = middle + 1;
    else high = middle;
  }
  // Sliced around the ranges, never split per character: a whole document is
  // often one piece.
  let out = "";
  let cursor = 0;
  for (let range = low; range < hidden.length && hidden[range][0] < end; range++) {
    const from = Math.max(cursor, Math.floor((hidden[range][0] - offset) / width));
    const to = Math.min(text.length, Math.ceil((hidden[range][1] - offset) / width));
    if (from >= to) continue;
    out += text.slice(cursor, from);
    for (let at = from; at < to; at++) out += text.charCodeAt(at) >= 0x20 ? String.fromCharCode(HIDDEN) : text[at];
    cursor = to;
  }
  return out + text.slice(cursor);
}

/**
 * Word's control characters into plain text. A field is `begin code separator
 * result end`; the result is what the reader saw, the code is Word's own. A
 * field with nothing to show (a SEQ counter, a form field) ends without ever
 * reaching a separator, and fields nest, so this is a stack of "still in the
 * code" flags rather than a counter.
 */
function plain(text: string, left: { hidden: number }): string {
  let out = "";
  const fields: boolean[] = [];
  let hiding = false;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === FIELD_BEGIN) {
      fields.push(true);
      continue;
    }
    if (code === FIELD_SEPARATOR) {
      if (fields.length > 0) fields[fields.length - 1] = false;
      continue;
    }
    if (code === FIELD_END) {
      fields.pop();
      continue;
    }
    if (fields.includes(true)) continue;
    // A stretch of hidden characters outside any field code is one passage
    // left out; a hidden XE index entry or TC entry is a field code anyway.
    if (code === HIDDEN) {
      if (!hiding) left.hidden++;
      hiding = true;
      continue;
    }
    hiding = false;
    if (code === PARAGRAPH || code === LINE_BREAK || code === PAGE_BREAK) out += "\n";
    // ponytail: a row ends with a cell mark right after the last cell's, so two
    // in a row is read as a row break; an empty cell reads the same way and
    // splits its row. Telling them apart needs the paragraph properties.
    else if (code === CELL_MARK) out += out.endsWith("\t") ? "\n" : "\t";
    else if (code >= 0x20 || code === 0x09) out += char;
  }
  return out
    .replace(/\t+\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** FibRgFcLcb97 (MS-DOC 2.5.6): the comment tables, the authors' names and the header stories. */
const FC_PLCF_AND_REF = 0x00ba;
const FC_PLCF_AND_TXT = 0x00c2;
const FC_GRP_XST_ATN_OWNERS = 0x01ba;
const FC_PLCF_HDD = 0x00f2;

/** The table-stream structure an FcLcb pair at `offset` of the FIB names, if it fits. */
function listed(word: Uint8Array, table: Uint8Array, offset: number): DataView | undefined {
  if (offset + 8 > word.byteLength) return undefined;
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const fc = fib.getUint32(offset, true);
  const lcb = fib.getUint32(offset + 4, true);
  return lcb > 0 && fc + lcb <= table.byteLength ? new DataView(table.buffer, table.byteOffset + fc, lcb) : undefined;
}

/**
 * The header part split into its stories by PlcfHdd (MS-DOC 2.3.3): six
 * footnote and endnote separators, then six per section, in the order even
 * header, odd header, even footer, odd footer, first-page header, first-page
 * footer. Each distinct line once, as the docx path writes them; the header
 * text boxes (2.3.7) count as header. POI reads the same table
 * (`HeaderStories`), and Tika writes them before and after the body.
 *
 * ponytail: a WordArt watermark is a shape, not story text, and is left out.
 */
function pageFurniture(
  word: Uint8Array,
  table: Uint8Array,
  stories: string,
  boxes: string,
  left: { hidden: number },
): { headers: string[]; footers: string[] } {
  const found = { headers: [] as string[], footers: [] as string[] };
  const seen = new Set<string>();
  const add = (into: string[], text: string) => {
    for (const line of plain(text, left).split("\n")) {
      const folded = line.replace(/\s+/g, " ").trim();
      if (folded && !seen.has(folded)) {
        seen.add(folded);
        into.push(folded);
      }
    }
  };
  const plc = listed(word, table, FC_PLCF_HDD);
  const count = plc ? Math.floor(plc.byteLength / 4) - 1 : 0;
  // Read forward only, so a forged table whose stories overlap cannot read
  // the part more than once.
  let read = 0;
  for (let story = 6; plc && story < count; story++) {
    const from = Math.max(read, plc.getUint32(story * 4, true));
    const to = Math.max(from, Math.min(stories.length, plc.getUint32((story + 1) * 4, true)));
    read = to;
    add([0, 1, 4].includes((story - 6) % 6) ? found.headers : found.footers, stories.slice(from, to));
  }
  add(found.headers, boxes);
  return found;
}

/**
 * Each comment (MS-DOC 2.3.4) as `[Comment, author: text]` with the position
 * of its reference mark in the body. PlcfandRef lists the marks, each with an
 * ATRDPre10 naming its author by index into GrpXstAtnOwners (else by
 * initials); PlcfandTxt splits the comment part into one range per comment.
 * POI reads the same three (`HWPFDocument.getCommentsRange`, `ATRD`).
 */
function commentLabels(
  word: Uint8Array,
  table: Uint8Array,
  comments: string,
  left: { hidden: number },
): { at: number; label: string }[] {
  const refs = listed(word, table, FC_PLCF_AND_REF);
  const txt = listed(word, table, FC_PLCF_AND_TXT);
  if (!refs || !txt) return [];
  const utf16 = new TextDecoder("utf-16le");
  const name = (view: DataView, at: number, length: number) =>
    utf16.decode(new Uint8Array(view.buffer, view.byteOffset + at, Math.min(length * 2, view.byteLength - at)));
  const owners: string[] = [];
  const grp = listed(word, table, FC_GRP_XST_ATN_OWNERS);
  for (let at = 0; grp && at + 2 <= grp.byteLength; ) {
    const length = grp.getUint16(at, true);
    owners.push(name(grp, at + 2, length));
    at += 2 + length * 2;
  }
  const count = Math.min(Math.floor((refs.byteLength - 4) / 34), Math.floor(txt.byteLength / 4));
  const labels: { at: number; label: string }[] = [];
  // Ranges are read forward only, so a forged table whose ranges overlap
  // cannot read the part more than once.
  let read = 0;
  for (let i = 0; i < count; i++) {
    const from = Math.max(read, txt.getUint32(i * 4, true));
    const to = Math.max(from, Math.min(comments.length, i + 1 < txt.byteLength / 4 ? txt.getUint32((i + 1) * 4, true) : comments.length));
    read = to;
    const body = plain(comments.slice(from, to), left).replace(/\s+/g, " ");
    if (!body) continue;
    const atrd = (count + 1) * 4 + i * 30;
    const author = owners[refs.getUint16(atrd + 20, true)] ?? name(refs, atrd + 2, Math.min(9, refs.getUint16(atrd, true)));
    // A name is the file's to choose: control characters would act on the
    // body, and one long name named by every comment would multiply the text.
    // Word caps an author's name at 255 characters.
    const by = Array.from(author.slice(0, 255), (c) => (c < " " ? " " : c)).join("").replace(/\s+/g, " ").trim();
    labels.push({ at: refs.getUint32(i * 4, true), label: `[Comment${by ? `, ${by}` : ""}: ${body}]` });
  }
  return labels;
}

/**
 * Each label moved to the first paragraph or cell mark at or after its
 * position, to be written before it. Positions are character positions, which
 * the text's indices are, one per CP.
 */
function atParagraphEnds(body: string, labels: { at: number; label: string }[]): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  let end = -1;
  for (const { at, label } of [...labels].sort((a, b) => a.at - b.at)) {
    if (at >= body.length) continue;
    if (end < at) {
      end = at;
      while (end < body.length && body.charCodeAt(end) !== PARAGRAPH && body.charCodeAt(end) !== CELL_MARK) end++;
    }
    out.push({ at: end, text: ` ${label}` });
  }
  return out;
}

/** `body` with each text written at its position; equal positions keep their order. */
function insertAll(body: string, inserts: { at: number; text: string }[]): string {
  let out = "";
  let cursor = 0;
  for (const { at, text } of [...inserts].sort((a, b) => a.at - b.at)) {
    out += body.slice(cursor, at) + text;
    cursor = at;
  }
  return out + body.slice(cursor);
}

/** FibRgFcLcb97: paragraph property pages, the list definitions, the list instances. */
const FC_PLCF_BTE_PAPX = 0x0102;
const FC_PLF_LST = 0x02e2;
const FC_PLF_LFO = 0x02ea;
/** sprmPIlvl and sprmPIlfo (MS-DOC 2.6.2): a paragraph's list level and list instance. */
const SPRM_ILVL = 0x260a;
const SPRM_ILFO = 0x460b;
/** MS-DOC 2.9.158 nfc to the format names the docx reader uses; any other reads as decimal. */
const NFC: Record<number, string> = {
  0: "decimal", 1: "upperRoman", 2: "lowerRoman", 3: "upperLetter", 4: "lowerLetter",
  5: "ordinal", 22: "decimalZero", 23: "bullet", 255: "none",
};

/**
 * An LVL (MS-DOC 2.9.150) at `at`: the fixed LVLF, its two property runs, then
 * the number text, where characters 0 to 8 stand for the counters of levels
 * 1 to 9. Nothing when it does not fit.
 */
function readLvl(view: DataView, at: number): { level: ListLevel; next: number } | undefined {
  if (at + 28 > view.byteLength) return undefined;
  const flags = view.getUint8(at + 5);
  const xst = at + 28 + view.getUint8(at + 24) + view.getUint8(at + 25);
  if (xst + 2 > view.byteLength) return undefined;
  const length = view.getUint16(xst, true);
  if (xst + 2 + length * 2 > view.byteLength) return undefined;
  let text = "";
  for (let i = 0; i < length; i++) {
    const code = view.getUint16(xst + 2 + i * 2, true);
    text += code < 9 ? `%${code + 1}` : String.fromCharCode(code);
  }
  const level: ListLevel = {
    format: NFC[view.getUint8(at + 4)] ?? "decimal",
    text,
    start: view.getInt32(at, true),
    // fNoRestart: restart only after a level above ilvlRestartLim, 0 never.
    restart: flags & 0x08 ? view.getUint8(at + 26) : undefined,
    legal: (flags & 0x04) !== 0,
  };
  return { level, next: xst + 2 + length * 2 };
}

/**
 * A labeller over a .doc's list tables, keyed by a paragraph's LFO index, as
 * Tika's ListManager and POI's HWPFList read them: PlfLst gives each list's
 * levels, appended LVLs after its LSTFs (9, or 1 for a simple list), and
 * PlfLfo gives each instance its list and, in LFOLVLs, its start values and
 * replaced levels. The counting is the docx reader's.
 */
function docListLabels(word: Uint8Array, table: Uint8Array): ((ilfo: number, ilvl: number) => string | undefined) | undefined {
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  // The FIB says how many FcLcb pairs it holds; PlfLfo is pair 74.
  if (fib.getUint16(0x98, true) < 75) return undefined;
  const lst = listed(word, table, FC_PLF_LST);
  const lfo = listed(word, table, FC_PLF_LFO);
  if (!lst || !lfo || lst.byteLength < 2 || lfo.byteLength < 4) return undefined;
  const whole = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const abstracts = new Map<string, ListDefinition>();
  const lists = Math.min(Math.max(0, lst.getInt16(0, true)), Math.floor((lst.byteLength - 2) / 28));
  let at = fib.getUint32(FC_PLF_LST, true) + 2 + lists * 28;
  for (let i = 0; i < lists; i++) {
    const levels = new Map<number, ListLevel>();
    abstracts.set(String(lst.getInt32(2 + i * 28, true)), { levels });
    const simple = (lst.getUint8(2 + i * 28 + 26) & 0x01) !== 0;
    for (let n = 0; n < (simple ? 1 : 9); n++) {
      const read = readLvl(whole, at);
      if (!read) break;
      levels.set(n, read.level);
      at = read.next;
    }
  }
  const instances = new Map<string, ListInstance>();
  const count = Math.min(lfo.getUint32(0, true), Math.floor((lfo.byteLength - 4) / 16));
  // Each LFO's LFOData follows the array: a CP, then one LFOLVL per override.
  let data = 4 + count * 16;
  for (let i = 0; i < count; i++) {
    const instance: ListInstance = { abstract: String(lfo.getInt32(4 + i * 16, true)), starts: new Map(), levels: new Map() };
    instances.set(String(i + 1), instance);
    data += 4;
    for (let n = lfo.getUint8(4 + i * 16 + 12); n > 0 && data + 8 <= lfo.byteLength; n--) {
      const flags = lfo.getUint8(data + 4);
      const ilvl = flags & 0x0f;
      if (flags & 0x10) instance.starts.set(ilvl, lfo.getInt32(data, true));
      data += 8;
      if (flags & 0x20) {
        const read = readLvl(lfo, data);
        if (!read) break;
        instance.levels.set(ilvl, read.level);
        data = read.next;
      }
    }
  }
  const label = listLabels(abstracts, instances);
  return (ilfo, ilvl) => label(String(ilfo), ilvl);
}

/**
 * Each paragraph run that belongs to a list, by its byte range in
 * `WordDocument`: PlcBtePapx names the paragraph property pages (PapxFkp,
 * MS-DOC 2.9.175), each listing runs and their properties. Read from the
 * paragraph's own properties.
 *
 * ponytail: a list applied through the paragraph's style (its istd in the
 * stylesheet) is not followed; read STSH when such files turn up.
 */
function listParagraphs(word: Uint8Array, table: Uint8Array): { from: number; to: number; ilfo: number; ilvl: number }[] {
  const plc = listed(word, table, FC_PLCF_BTE_PAPX);
  const runs: { from: number; to: number; ilfo: number; ilvl: number }[] = [];
  if (!plc || plc.byteLength < 8) return runs;
  const pages = Math.floor((plc.byteLength - 4) / 8);
  const seen = new Set<number>();
  for (let page = 0; page < pages; page++) {
    const base = (plc.getUint32((pages + 1) * 4 + page * 4, true) & 0x3fffff) * 512;
    if (base + 512 > word.byteLength || seen.has(base)) continue;
    seen.add(base);
    const fkp = new DataView(word.buffer, word.byteOffset + base, 512);
    const count = fkp.getUint8(511);
    if ((count + 1) * 4 + count * 13 > 511) continue;
    for (let run = 0; run < count; run++) {
      const papx = fkp.getUint8((count + 1) * 4 + run * 13) * 2;
      if (papx === 0 || papx + 2 >= 511) continue;
      const cb = fkp.getUint8(papx);
      const start = cb ? papx + 1 : papx + 2;
      const end = Math.min(511, start + (cb ? cb * 2 - 1 : fkp.getUint8(papx + 1) * 2));
      let ilfo = 0;
      let ilvl = 0;
      // The istd first, then sprms as in a ChpxFkp.
      for (let at = start + 2; at + 2 <= end; ) {
        const sprm = fkp.getUint16(at, true);
        at += 2;
        const size = [1, 1, 2, 4, 2, 2, -1, 3][sprm >>> 13];
        if (sprm === SPRM_ILFO && at + 2 <= end) ilfo = fkp.getInt16(at, true);
        else if (sprm === SPRM_ILVL && at < end) ilvl = fkp.getUint8(at);
        at += size < 0 ? (at < end ? fkp.getUint8(at) + 1 : 1) : size;
      }
      if (ilfo > 0) runs.push({ from: fkp.getUint32(run * 4, true), to: fkp.getUint32((run + 1) * 4, true), ilfo, ilvl: Math.min(ilvl, 8) });
    }
  }
  return runs.sort((a, b) => a.from - b.from);
}

/**
 * The label to write at the start of each list paragraph of the body, indented
 * four spaces a level as the docx reader writes them. A paragraph with nothing
 * visible (hidden or deleted text) is neither labelled nor counted.
 */
function listLabelInserts(word: Uint8Array, table: Uint8Array, body: string, pieces: Piece[]): { at: number; text: string }[] {
  const runs = listParagraphs(word, table);
  const label = runs.length ? docListLabels(word, table) : undefined;
  if (!label) return [];
  const inserts: { at: number; text: string }[] = [];
  let piece = 0;
  let start = 0;
  for (let at = 0; at < body.length; at++) {
    const code = body.charCodeAt(at);
    if (code !== PARAGRAPH && code !== CELL_MARK) continue;
    while (piece < pieces.length && pieces[piece]!.end <= at) piece++;
    const holder = pieces[piece];
    const paragraph = body.slice(start, at);
    const from = start;
    start = at + 1;
    if (!holder || holder.cp > at || !paragraph.split("").some((c) => c >= " ")) continue;
    const fc = holder.offset + (at - holder.cp) * holder.width;
    // The last run that starts at or before the mark's byte.
    let low = 0;
    for (let high = runs.length; low < high; ) {
      const middle = (low + high) >>> 1;
      if (runs[middle]!.from <= fc) low = middle + 1;
      else high = middle;
    }
    const run = runs[low - 1];
    if (!run || fc >= run.to) continue;
    const text = label(run.ilfo, run.ilvl);
    if (text !== undefined) inserts.push({ at: from, text: `${"    ".repeat(run.ilvl)}${text ? `${text} ` : ""}` });
  }
  return inserts;
}

const NOT_THIS_READER: ExtractionResult = { text: "", notes: [{ kind: "parser-unavailable" }] };

/**
 * The text of a `.doc`, from its `WordDocument` and table streams. Empty text
 * means nothing could be read (ADR-0003): a document with no characters, or
 * one whose pieces point outside the stream.
 */
export function formatDoc(streams: CfbStreams): ExtractionResult {
  const word = streams.get("WordDocument");
  if (!word || word.byteLength < 0x01aa) return NOT_THIS_READER;
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (fib.getUint16(0, true) !== 0xa5ec || fib.getUint16(2, true) < WORD_97) return NOT_THIS_READER;
  const flags = fib.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error("Password protected");
  const table = streams.get(flags & 0x0200 ? "1Table" : "0Table");
  if (!table) return NOT_THIS_READER;

  const { text: all, pieces } = readPieces(word, table);
  // Character counts of each part of the stream, in the order they are stored.
  const [body, footnotes, headers, macros, comments, endnotes, textboxes, headerBoxes] = [
    0x4c, 0x50, 0x54, 0x58, 0x5c, 0x60, 0x64, 0x68,
  ].map((offset) => fib.getInt32(offset, true));
  let cursor = 0;
  const part = (length: number): string => {
    const slice = all.slice(cursor, cursor + Math.max(0, length));
    cursor += Math.max(0, length);
    return slice;
  };
  const kept = [part(body), part(footnotes)];
  const stories = part(headers);
  part(macros);
  const left = { hidden: 0 };
  const labels = commentLabels(word, table, part(comments), left).filter(({ at }) => at < kept[0].length);
  kept[0] = insertAll(kept[0], [...listLabelInserts(word, table, kept[0], pieces), ...atParagraphEnds(kept[0], labels)]);
  kept.push(part(endnotes), part(textboxes));
  const furniture = pageFurniture(word, table, stories, part(headerBoxes), left);
  const block = (label: string, lines: string[]) => (lines.length ? [[label, ...lines].join("\n")] : []);

  const text = [
    ...block("--- Page header ---", furniture.headers),
    ...kept.map((part) => plain(part, left)),
    ...block("--- Page footer ---", furniture.footers),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!text) return { text };
  const notes: ExtractionNote[] = [];
  if (left.hidden > 0) notes.push({ kind: "hidden-left-out", count: left.hidden });
  if (labels.length > 0) notes.push({ kind: "comments-included", count: labels.length });
  const title = summaryTitle(streams.get(SUMMARY_INFORMATION));
  return { text, ...(notes.length ? { notes } : {}), ...(title ? { title } : {}) };
}
