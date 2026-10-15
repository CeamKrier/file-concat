import type { CfbStreams } from "./msg";
import { SUMMARY_INFORMATION, summaryTitle } from "./title";
import type { ExtractionResult } from "./types";

/**
 * PowerPoint 97-2003 decks (`.ppt`, MS-PPT), the text only.
 *
 * The `PowerPoint Document` stream is a heap of records, and which of them
 * are live is not in the stream itself: the `Current User` stream points at
 * the newest UserEditAtom, each edit points at the one before it and at a
 * persist directory, and the directories together map a persist id to the
 * offset of the record that currently holds it (newest wins). A deck saved
 * incrementally keeps every superseded slide in the stream, so a reader that
 * scans it linearly (catdoc, anydoc's recovery path) prints old edits too.
 * POI, LibreOffice and anydoc all take this route; so does this.
 *
 * The DocumentContainer's three slide lists give the slides in presentation
 * order, the masters and the notes. A slide's text sits in its drawing, one
 * shape at a time: either in the shape's own ClientTextbox, or, for the title
 * and body placeholders, in the slide list itself, which the shape names by
 * index (OutlineTextRefAtom).
 *
 * Shaped like the pptx output: `# Slide n`, `(hidden)` on a hidden slide, the
 * speaker notes under `--- Speaker notes ---`, the slide number placeholder
 * dropped and the footer kept once. Text on the masters that is not a
 * placeholder prompt is the author's too (POI and Tika print it) and is kept
 * once, at the end, with the footer.
 *
 * Only the reading lives here, over streams already lifted out of the
 * container (ADR-0012). A PowerPoint 95 deck, or one whose edit chain does not
 * lead to a document, is declined with `parser-unavailable`, so the chain
 * still gives anydoc's recovery a go; a password-protected one throws.
 */

/** Record types (MS-PPT 2.13.24, MS-ODRAW 2.1.4). */
const DOCUMENT = 0x03e8;
const SLIDE = 0x03ee;
const SLIDE_ATOM = 0x03ef;
const NOTES = 0x03f0;
const NOTES_ATOM = 0x03f1;
const SLIDE_PERSIST = 0x03f3;
const SLIDE_SHOW_INFO = 0x03f9;
const DRAWING = 0x040c;
const PLACEHOLDER = 0x0bc3;
const OUTLINE_TEXT_REF = 0x0f9e;
const TEXT_HEADER = 0x0f9f;
const TEXT_CHARS = 0x0fa0;
const TEXT_BYTES = 0x0fa8;
const CSTRING = 0x0fba;
const HEADERS_FOOTERS = 0x0fd9;
const HEADERS_FOOTERS_ATOM = 0x0fda;
const SLIDE_LIST = 0x0ff0;
const USER_EDIT = 0x0ff5;
const PERSIST_DIRECTORY = 0x1772;
const PROG_TAGS = 0x1388;
const PROG_BINARY_TAG = 0x138a;
const BINARY_TAG_DATA = 0x138b;
const COMMENT = 0x2ee0;
const CRYPT_SESSION = 0x2f14;
const DG = 0xf002;
const SPGR = 0xf003;
const SP = 0xf004;
const FSP = 0xf00a;
const OPT = 0xf00b;
const CLIENT_TEXTBOX = 0xf00d;
const CHILD_ANCHOR = 0xf00f;
const CLIENT_ANCHOR = 0xf010;
const CLIENT_DATA = 0xf011;
const TERTIARY_OPT = 0xf122;

/** Field atoms, each pinning a `*` in the text that the viewer fills in:
 * slide number, date, generic date, header, footer, RTF date (2.9.47-2.9.52). */
const FIELDS = new Set([0x0fd8, 0x0ff7, 0x0ff8, 0x0ff9, 0x0ffa, 0x1015]);

/** Current User header token of an encrypted deck (2.3.2). */
const ENCRYPTED_TOKEN = 0xf3d1c4df;
/** MS-ODRAW tableProperties (2.3.4.36), in the tertiary property table. */
const TABLE_PROPERTIES = 0x039f;
const LINE_SHAPE = 20;
/** Slide list instances (2.4.14.3). */
const SLIDES = 0;
const MASTERS = 1;
const NOTES_LIST = 2;

/** PlaceholderEnum (2.13.21): date, slide number, footer and header are
 * furniture on any sheet; the slide image on a notes page is not text. */
const MASTER_NOTES_IMAGE = 0x05;
const MASTER_FOOTER = 0x09;
const NOTES_IMAGE = 0x0b;
const furniture = (ph: number) => ph >= 0x07 && ph <= 0x0a;

/** Caps against a crafted stream: records read in all, group nesting, and the
 * cells of one table's grid. */
const MAX_RECORDS = 2_000_000;
const MAX_DEPTH = 64;
const MAX_TABLE_CELLS = 100_000;

const NOT_THIS_READER: ExtractionResult = { text: "", notes: [{ kind: "parser-unavailable" }] };

/** Thrown inside the reader for a stream it cannot walk; never escapes it. */
class Unreadable extends Error {}

interface PptRecord {
  type: number;
  inst: number;
  body: Uint8Array;
}

interface TextBody {
  text: string;
  /** Code-unit positions of field `*` characters. */
  fields: Set<number>;
}

interface Shape {
  ph: number;
  shapeType: number;
  textbox?: Uint8Array;
  table: boolean;
  anchor?: { x: number; y: number };
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;
const i32 = (b: Uint8Array, at: number) => u32(b, at) | 0;
const i16 = (b: Uint8Array, at: number) => (u16(b, at) << 16) >> 16;

const utf16 = new TextDecoder("utf-16le");
/** A TextBytesAtom holds the low byte of each UTF-16 unit (2.9.43), which is
 * Latin-1, not the Windows-1252 that TextDecoder("latin1") gives. */
function lowBytes(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 8192) {
    out += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return out;
}

/** One record at `at`, or nothing when its header or body would run past the end. */
function recordAt(bytes: Uint8Array, at: number): PptRecord | undefined {
  if (!Number.isInteger(at) || at < 0 || at + 8 > bytes.length) return undefined;
  const length = u32(bytes, at + 4);
  if (at + 8 + length > bytes.length) return undefined;
  return { type: u16(bytes, at + 2), inst: u16(bytes, at) >> 4, body: bytes.subarray(at + 8, at + 8 + length) };
}

/**
 * Field `*`s removed, paragraph and line breaks as newlines, other control
 * characters dropped. A body that is nothing but a `*` is a field whose value
 * only the viewer knows, and says nothing.
 */
function render({ text, fields }: TextBody): string {
  let out = "";
  for (let at = 0; at < text.length; at++) {
    if (fields.has(at) && text[at] === "*") continue;
    out += text[at];
  }
  out = out
    .replace(/[\r\v]/g, "\n")
    // eslint-disable-next-line no-control-regex -- dropping control characters is the point
    .replace(/[\x00-\x08\x0c\x0e-\x1f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return out === "*" ? "" : out;
}

function readDeck(doc: Uint8Array, currentUser: Uint8Array): string {
  let budget = MAX_RECORDS;
  // Shapes can point at one outline body many times over; a real deck never
  // renders more characters than its stream has bytes, a forged one stops here.
  let characters = doc.length;
  const spend = (text: string) => {
    characters -= text.length;
    if (characters < 0) throw new Unreadable("text cap");
    return text;
  };
  function* children(bytes: Uint8Array): Generator<PptRecord> {
    for (let at = 0; ; ) {
      const record = recordAt(bytes, at);
      if (!record) return;
      if (--budget < 0) throw new Unreadable("record cap");
      yield record;
      at += 8 + record.body.length;
    }
  }
  const find = (bytes: Uint8Array, type: number, inst?: number) => {
    for (const record of children(bytes)) {
      if (record.type === type && (inst === undefined || record.inst === inst)) return record;
    }
    return undefined;
  };

  // The edit chain, newest first, into one persist map. A loop in the chain
  // ends at the first offset seen twice; a broken older link ends it there.
  const persist = new Map<number, number>();
  const seen = new Set<number>();
  let documentRef: number | undefined;
  let cryptRef: number | undefined;
  for (let at = u32(currentUser, 16); at !== 0 && !seen.has(at); ) {
    seen.add(at);
    const edit = recordAt(doc, at);
    if (!edit || edit.type !== USER_EDIT || edit.body.length < 28) {
      if (documentRef === undefined) throw new Unreadable("no edit");
      break;
    }
    if (documentRef === undefined) {
      documentRef = u32(edit.body, 16);
      // Present if and only if the deck is encrypted (2.3.3).
      if (edit.body.length >= 32) cryptRef = u32(edit.body, 28);
    }
    const directory = recordAt(doc, u32(edit.body, 12));
    if (directory?.type === PERSIST_DIRECTORY) {
      const entries = directory.body;
      for (let p = 0; p + 4 <= entries.length; ) {
        const head = u32(entries, p);
        p += 4;
        for (let k = 0; k < head >>> 20 && p + 4 <= entries.length; k++, p += 4) {
          if (--budget < 0) throw new Unreadable("record cap");
          const id = (head & 0xfffff) + k;
          if (!persist.has(id)) persist.set(id, u32(entries, p));
        }
      }
    }
    at = u32(edit.body, 8);
  }
  const object = (ref: number) => {
    const at = persist.get(ref);
    return at === undefined ? undefined : recordAt(doc, at);
  };
  if (cryptRef !== undefined && object(cryptRef)?.type === CRYPT_SESSION) throw new Error("Password protected");
  const document = documentRef === undefined ? undefined : object(documentRef);
  if (document?.type !== DOCUMENT) throw new Unreadable("no document");

  /** A run of records into text bodies, one per TextHeaderAtom. */
  const bodies = (records: Iterable<PptRecord>): TextBody[] => {
    const out: TextBody[] = [];
    for (const record of records) {
      const current = out[out.length - 1];
      if (record.type === TEXT_HEADER) out.push({ text: "", fields: new Set() });
      else if (!current) continue;
      else if (record.type === TEXT_CHARS) current.text += utf16.decode(record.body);
      else if (record.type === TEXT_BYTES) current.text += lowBytes(record.body);
      else if (FIELDS.has(record.type) && record.body.length >= 4) current.fields.add(i32(record.body, 0));
    }
    return out;
  };

  /** A slide list: per sheet, its persist ref, its id and its outline text. */
  const list = (inst: number) => {
    const sheets: { ref: number; id: number; records: PptRecord[] }[] = [];
    const found = find(document.body, SLIDE_LIST, inst);
    if (found) {
      for (const record of children(found.body)) {
        if (record.type === SLIDE_PERSIST && record.body.length >= 16) {
          sheets.push({ ref: u32(record.body, 0), id: u32(record.body, 12), records: [] });
        } else sheets[sheets.length - 1]?.records.push(record);
      }
    }
    return sheets.map(({ ref, id, records }) => ({ ref, id, outline: bodies(records) }));
  };

  const shapeOf = (container: Uint8Array): Shape => {
    const shape: Shape = { ph: -1, shapeType: 0, table: false };
    for (const record of children(container)) {
      if (record.type === FSP) shape.shapeType = record.inst;
      else if (record.type === CLIENT_DATA) {
        const placeholder = find(record.body, PLACEHOLDER);
        if (placeholder && placeholder.body.length >= 5) shape.ph = placeholder.body[4];
      } else if (record.type === CLIENT_TEXTBOX) shape.textbox = record.body;
      else if (record.type === OPT || record.type === TERTIARY_OPT) {
        // Six bytes a property, as many as the instance says.
        for (let k = 0; k < record.inst && k * 6 + 6 <= record.body.length; k++) {
          if ((u16(record.body, k * 6) & 0x3fff) === TABLE_PROPERTIES && u32(record.body, k * 6 + 2) & 1) {
            shape.table = true;
          }
        }
      } else if (record.type === CHILD_ANCHOR && record.body.length >= 8) {
        shape.anchor = { x: i32(record.body, 0), y: i32(record.body, 4) };
      } else if (record.type === CLIENT_ANCHOR && !shape.anchor) {
        if (record.body.length >= 16) shape.anchor = { x: i32(record.body, 4), y: i32(record.body, 0) };
        else if (record.body.length >= 8) shape.anchor = { x: i16(record.body, 2), y: i16(record.body, 0) };
      }
    }
    return shape;
  };

  /** A sheet's text, shape by shape in drawing order, minus the placeholders `skip` names. */
  const sheetText = (container: Uint8Array, outline: TextBody[], skip: (ph: number) => boolean): string => {
    const lines: string[] = [];
    const textOf = (textbox: Uint8Array) => {
      const ref = find(textbox, OUTLINE_TEXT_REF);
      const body = ref && ref.body.length >= 4 ? outline[u32(ref.body, 0)] : bodies(children(textbox))[0];
      return body ? spend(render(body)) : "";
    };
    const group = (bytes: Uint8Array, depth: number) => {
      if (depth > MAX_DEPTH) throw new Unreadable("nesting cap");
      const items = [...children(bytes)];
      // The first shape of a group is the group itself; a table is a group
      // whose own shape says so, and its cells are placed by their anchors.
      // Its grid lines are shapes of the group too, and carry no text.
      if (items[0]?.type === SP && shapeOf(items[0].body).table) {
        const cells = items
          .slice(1)
          .filter((item) => item.type === SP)
          .map((item) => shapeOf(item.body))
          .filter((cell) => cell.anchor && cell.shapeType !== LINE_SHAPE);
        const index = (values: number[]) => new Map([...new Set(values)].sort((a, b) => a - b).map((v, i) => [v, i]));
        const ys = index(cells.map((cell) => cell.anchor!.y));
        const xs = index(cells.map((cell) => cell.anchor!.x));
        if (ys.size * xs.size > MAX_TABLE_CELLS) throw new Unreadable("table cap");
        const grid = Array.from(ys, () => Array.from(xs, () => ""));
        for (const cell of cells) {
          const text = cell.textbox ? textOf(cell.textbox).replace(/\n/g, " ") : "";
          grid[ys.get(cell.anchor!.y)!][xs.get(cell.anchor!.x)!] = text;
        }
        const rows = grid.map((row) => row.join("\t")).filter((row) => row.trim());
        if (rows.length) lines.push(rows.join("\n"));
        return;
      }
      for (const item of items) {
        if (item.type === SPGR) group(item.body, depth + 1);
        else if (item.type === SP) {
          const shape = shapeOf(item.body);
          if (!shape.textbox || skip(shape.ph)) continue;
          const text = textOf(shape.textbox);
          if (text) lines.push(text);
        }
      }
    };
    const drawing = find(container, DRAWING);
    const dg = drawing && find(drawing.body, DG);
    const top = dg && find(dg.body, SPGR);
    if (top) group(top.body, 0);
    return lines.join("\n");
  };

  /** A sheet's binary tags, the data PowerPoint 2000 and later add under a name. */
  const binaryTags = (container: Uint8Array) => {
    const out = new Map<string, Uint8Array>();
    const tags = find(container, PROG_TAGS);
    if (!tags) return out;
    for (const tag of children(tags.body)) {
      if (tag.type !== PROG_BINARY_TAG) continue;
      const name = find(tag.body, CSTRING);
      const data = find(tag.body, BINARY_TAG_DATA);
      if (name && data) out.set(utf16.decode(name.body), data.body);
    }
    return out;
  };

  /** A slide's comments (PowerPoint 2002 and later), from its `___PPT10` tag. */
  const commentsOf = (container: Uint8Array): string[] => {
    const out: string[] = [];
    const data = binaryTags(container).get("___PPT10");
    if (!data) return out;
    for (const comment of children(data)) {
      if (comment.type !== COMMENT) continue;
      const author = find(comment.body, CSTRING, 0);
      const text = find(comment.body, CSTRING, 1);
      const said = text ? spend(render({ text: utf16.decode(text.body), fields: new Set() })) : "";
      if (said) out.push(`${author ? utf16.decode(author.body).trim() : "Unknown"}: ${said}`);
    }
    return out;
  };

  // Notes pages name their slide by id; header, footer and slide image are
  // the notes master's furniture, not the speaker's.
  const notesBySlide = new Map<number, string>();
  for (const sheet of list(NOTES_LIST)) {
    const container = object(sheet.ref);
    if (container?.type !== NOTES) continue;
    const atom = find(container.body, NOTES_ATOM);
    if (!atom || atom.body.length < 4) continue;
    const text = sheetText(container.body, sheet.outline, (ph) => furniture(ph) || ph === NOTES_IMAGE || ph === MASTER_NOTES_IMAGE);
    if (text) notesBySlide.set(u32(atom.body, 0), text);
  }

  const blocks: string[] = [];
  const masters = new Set<number>();
  let anyText = false;
  let number = 0;
  for (const sheet of list(SLIDES)) {
    const container = object(sheet.ref);
    if (container?.type !== SLIDE) continue;
    number += 1;
    const atom = find(container.body, SLIDE_ATOM);
    if (atom && atom.body.length >= 16) masters.add(u32(atom.body, 12));
    const info = find(container.body, SLIDE_SHOW_INFO);
    const hidden = !!info && info.body.length >= 12 && (u16(info.body, 10) & 0x0004) !== 0;
    const text = sheetText(container.body, sheet.outline, furniture);
    const comments = commentsOf(container.body);
    const notes = notesBySlide.get(sheet.id);
    if (text || comments.length || notes) anyText = true;
    blocks.push(
      [
        `# Slide ${number}${hidden ? " (hidden)" : ""}`,
        text,
        ...(comments.length ? ["--- Comments ---", ...comments] : []),
        ...(notes ? ["--- Speaker notes ---", notes] : []),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // Master text that is not a placeholder prompt, once, for the masters the
  // slides use, and the footer once.
  const master: string[] = [];
  let masterFooter = "";
  const masterList = list(MASTERS);
  for (const sheet of masterList) {
    if (!masters.has(sheet.id)) continue;
    const container = object(sheet.ref);
    if (!container) continue;
    const text = sheetText(container.body, sheet.outline, (ph) => ph > 0);
    if (text) master.push(text);
    masterFooter ||= sheetText(container.body, sheet.outline, (ph) => ph !== MASTER_FOOTER);
  }
  // PowerPoint 2007 and later stopped keeping the footer switch and text up to
  // date and use the master's footer placeholder instead; POI tells the two
  // apart by the `___PPT12` tag on the first master, and so does this. Before
  // that, a footer switched off is on no slide, whatever the master holds.
  const first = masterList[0] && object(masterList[0].ref);
  const ppt12 = !!first && binaryTags(first.body).has("___PPT12");
  const settings = find(document.body, HEADERS_FOOTERS, 3);
  const flags = settings && find(settings.body, HEADERS_FOOTERS_ATOM);
  const footerOn = !!flags && flags.body.length >= 4 && (u16(flags.body, 2) & 0x20) !== 0;
  const footerAtom = settings && find(settings.body, CSTRING, 2);
  const deckFooter = footerAtom ? render({ text: utf16.decode(footerAtom.body), fields: new Set() }) : "";
  const footer = ppt12 ? masterFooter : footerOn ? deckFooter || masterFooter : "";
  if (master.length || footer) {
    anyText = true;
    blocks.push(["# Master", ...master, ...(footer ? [`Footer: ${footer}`] : [])].join("\n"));
  }

  // Markers alone are ours, not the deck's: a deck with no text says so (ADR-0003).
  return anyText ? blocks.join("\n\n").replace(/\n{3,}/g, "\n\n") : "";
}

/**
 * The text of a `.ppt`, from its `PowerPoint Document` and `Current User`
 * streams. Empty text means the deck holds none.
 */
export function formatPpt(streams: CfbStreams): ExtractionResult {
  // A deck saved by PowerPoint 95 with "save as 97 too" keeps the 97 copy in
  // a storage of its own and the 95 one at the root; POI reads the copy.
  const dual = streams.has("PP97_DUALSTORAGE/PowerPoint Document") ? "PP97_DUALSTORAGE/" : "";
  const doc = streams.get(`${dual}PowerPoint Document`);
  const currentUser = streams.get(`${dual}Current User`);
  // PowerPoint 95 keeps a `PP40` stream instead, or a Current User too short
  // to hold the 97 header.
  if (!doc || !currentUser || currentUser.byteLength < 28) return NOT_THIS_READER;
  if (u32(currentUser, 12) === ENCRYPTED_TOKEN) throw new Error("Password protected");
  try {
    const title = summaryTitle(streams.get(SUMMARY_INFORMATION));
    return { text: readDeck(doc, currentUser), ...(title ? { title } : {}) };
  } catch (error) {
    if (error instanceof Unreadable) return NOT_THIS_READER;
    throw error;
  }
}
