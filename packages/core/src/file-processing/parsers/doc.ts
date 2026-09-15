import type { CfbStreams } from "./msg";
import type { ExtractionResult } from "./types";

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
 * notes and the text boxes are kept; headers and comments are not, for the
 * reason the office reader drops running furniture from a PDF.
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

function readPieces(word: Uint8Array, table: Uint8Array): string {
  const fib = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const fcClx = fib.getUint32(0x01a2, true);
  const lcbClx = fib.getUint32(0x01a6, true);
  if (fcClx + lcbClx > table.byteLength) return "";
  const clx = new DataView(table.buffer, table.byteOffset + fcClx, lcbClx);

  // The CLX is a run of property modifiers (0x01, then a 2-byte length) and
  // then the piece table itself (0x02, then a 4-byte length).
  let at = 0;
  while (at < lcbClx && clx.getUint8(at) === 0x01) at += 3 + clx.getUint16(at + 1, true);
  if (at >= lcbClx || clx.getUint8(at) !== 0x02) return "";
  const lcbPlc = clx.getUint32(at + 1, true);
  const plc = at + 5;
  const count = Math.floor((lcbPlc - 4) / 12);

  const utf16 = new TextDecoder("utf-16le");
  const ansi = new TextDecoder("windows-1252");
  let text = "";
  for (let piece = 0; piece < count; piece++) {
    const start = clx.getUint32(plc + piece * 4, true);
    const end = clx.getUint32(plc + (piece + 1) * 4, true);
    const fc = clx.getUint32(plc + (count + 1) * 4 + piece * 8 + 2, true);
    const compressed = (fc & 0x40000000) !== 0;
    const offset = compressed ? (fc & 0x3fffffff) >>> 1 : fc & 0x3fffffff;
    const length = (end - start) * (compressed ? 1 : 2);
    if (offset + length > word.byteLength) break;
    const bytes = word.subarray(offset, offset + length);
    text += compressed ? ansi.decode(bytes) : utf16.decode(bytes);
  }
  return text;
}

/**
 * Word's control characters into plain text. A field is `begin code separator
 * result end`; the result is what the reader saw, the code is Word's own. A
 * field with nothing to show (a SEQ counter, a form field) ends without ever
 * reaching a separator, and fields nest, so this is a stack of "still in the
 * code" flags rather than a counter.
 */
function plain(text: string): string {
  let out = "";
  const fields: boolean[] = [];
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

  const all = readPieces(word, table);
  // Character counts of each part of the stream, in the order they are stored.
  const [body, footnotes, headers, macros, comments, endnotes, textboxes] = [
    0x4c, 0x50, 0x54, 0x58, 0x5c, 0x60, 0x64,
  ].map((offset) => fib.getInt32(offset, true));
  let cursor = 0;
  const part = (length: number): string => {
    const slice = all.slice(cursor, cursor + Math.max(0, length));
    cursor += Math.max(0, length);
    return slice;
  };
  const kept = [part(body), part(footnotes)];
  part(headers);
  part(macros);
  part(comments);
  kept.push(part(endnotes), part(textboxes));

  return { text: kept.map(plain).filter(Boolean).join("\n\n") };
}
