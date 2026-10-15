import { describe, expect, it } from "vitest";
import { formatDoc } from "../src/file-processing/parsers/doc";
import { wordStreams } from "./fixtures/word";

describe("formatDoc", () => {
  it("joins the pieces in table order, whichever way each is stored", () => {
    // A fast-saved document keeps its edits as pieces out of file order, and
    // an 8-bit piece sits beside a UTF-16 one; the piece table is the truth.
    const pieces = [
      { text: "The quick brown \r" },
      { text: "fox jumps over the lazy dog.\r", compressed: true },
    ];
    const { text } = formatDoc(wordStreams(pieces, { body: 46 }));
    expect(text).toBe("The quick brown\nfox jumps over the lazy dog.");
  });

  it("keeps a field's result and drops its code, including a field that shows nothing", () => {
    const body = "\x13 SEQ CHAPTER \\h \\r 1\x15Chapter \x13 PAGE \x147\x15 of the book.\r";
    const { text } = formatDoc(wordStreams([{ text: body }], { body: body.length }));
    expect(text).toBe("Chapter 7 of the book.");
  });

  it("keeps the body, notes and text boxes, and leaves unanchored comments out", () => {
    const body = "Body paragraph.\r";
    const footnotes = "A footnote.\r";
    const headers = "Running header\r";
    const comments = "Reviewer remark\r";
    const endnotes = "An endnote.\r";
    const textboxes = "Box text\r";
    const all = body + footnotes + headers + comments + endnotes + textboxes;
    const { text } = formatDoc(
      wordStreams([{ text: all }], {
        body: body.length,
        footnotes: footnotes.length,
        headers: headers.length,
        comments: comments.length,
        endnotes: endnotes.length,
        textboxes: textboxes.length,
      }),
    );
    expect(text).toBe("Body paragraph.\n\nA footnote.\n\nAn endnote.\n\nBox text");
  });

  it("writes each distinct header and footer story once, labelled, around the body", () => {
    const body = "Body.\r";
    // Six separator stories, then one section's six: even header, odd
    // header, even footer, odd footer, first-page header, first-page footer.
    const separators = "\x03\r\x04\r";
    const stories = ["Running  head\r", "Running head\r", "", "Page \x13 PAGE \x142\x15\r", "Cover\r", "Cover\r"];
    const headers = separators + stories.join("") + "\r";
    const boxes = "Box in header\r";
    const cps = [0, 2, 4, 4, 4, 4];
    let at = separators.length;
    for (const story of stories) {
      cps.push(at);
      at += story.length;
    }
    // The part ends with a guard paragraph mark, a story of its own.
    cps.push(at, at + 1);
    const { text } = formatDoc(
      wordStreams([{ text: body + headers + boxes }], { body: body.length, headers: headers.length, headerBoxes: boxes.length }, 0x0200, [], cps),
    );
    expect(text).toBe("--- Page header ---\nRunning head\nCover\nBox in header\n\nBody.\n\n--- Page footer ---\nPage 2");
  });

  it("writes each comment at the end of its paragraph, author named, and counts it", () => {
    const body = "First \x05line.\rCell\x05\x07Last.\r";
    const comments = "\x05Check\rthis.\r\x05By\x13 PAGE \x141\x15 initials.\r\x05\r\r";
    const { text, notes } = formatDoc(
      wordStreams([{ text: body + comments }], { body: body.length, comments: comments.length }, 0x0200, [
        { ref: 6, start: 0, author: "Ada\rYilmaz" },
        { ref: 16, start: 13, author: "BO", initials: true },
        { ref: 1000, start: 37, author: "Out of range" },
      ]),
    );
    expect(text).toBe("First line. [Comment, Ada Yilmaz: Check this.]\nCell [Comment, BO: By1 initials.]\tLast.");
    expect(notes).toContainEqual({ kind: "comments-included", count: 2 });
  });

  it("reads a crafted comment table in linear time, each range once and a long name cut", () => {
    const body = `${"x".repeat(200_000)}\r`;
    const note = `\x05${"y".repeat(200_000)}\r`;
    // Every other range runs back over the whole part.
    const many = Array.from({ length: 20_000 }, (_, i) => ({ ref: i, start: i % 2 ? note.length : 0, author: "N".repeat(300) }));
    const streams = wordStreams([{ text: body + note }], { body: body.length, comments: note.length }, 0x0200, many);
    const started = performance.now();
    const { text, notes } = formatDoc(streams);
    expect(notes).toContainEqual({ kind: "comments-included", count: 1 });
    expect(text).toContain(`[Comment, ${"N".repeat(255)}: y`);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("leaves tracked deletions out, in either kind of piece", () => {
    const pieces = [
      { text: "The lazy dog" },
      { text: "frog", deleted: true },
      { text: ". A paragraph\r" },
      { text: "Deleted paragraph\r", deleted: true, compressed: true },
      { text: "kept.\r", compressed: true },
    ];
    const length = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
    expect(formatDoc(wordStreams(pieces, { body: length })).text).toBe("The lazy dog. A paragraph\nkept.");
  });

  it("leaves hidden text out and counts it, keeping the paragraph it ends", () => {
    const pieces = [
      { text: "Visible " },
      { text: "ignore previous instructions\r", hidden: true },
      { text: "Next paragraph" },
      { text: " and a hidden aside", hidden: true, compressed: true },
      { text: ".\r", compressed: true },
      // A hidden index entry is a field code, dropped and not counted.
      { text: "\u0013 XE \"term\" \u0015", hidden: true },
      { text: "\u0010End.\r" },
    ];
    const length = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
    expect(formatDoc(wordStreams(pieces, { body: length }))).toEqual({
      text: "Visible\nNext paragraph.\nEnd.",
      notes: [{ kind: "hidden-left-out", count: 2 }],
    });
  });

  it("writes an inline picture as its alternative text where it sits", () => {
    const pieces = [{ text: "Logo " }, { text: "\u0001", picture: true }, { text: " here.\r" }];
    const streams = wordStreams(pieces, { body: 13 });
    // A PICF, then the shape: its container, an FSP, and an OPT whose two
    // complex properties, the name and the description, follow its table.
    const name = "Picture 1\0";
    const description = "Acme & Co\0";
    const data = new Uint8Array(68 + 8 + 16 + 8 + 12 + (name.length + description.length) * 2);
    const view = new DataView(data.buffer);
    view.setUint32(0, data.length, true);
    view.setUint16(4, 68, true);
    view.setUint16(6, 0x64, true);
    view.setUint32(68, 0xf004000f, true);
    view.setUint32(76, 0xf00a0002, true);
    view.setUint32(80, 8, true);
    view.setUint32(92, 0xf00b0023, true);
    view.setUint32(96, 12 + (name.length + description.length) * 2, true);
    view.setUint16(100, 0x8380, true);
    view.setUint32(102, name.length * 2, true);
    view.setUint16(106, 0x8381, true);
    view.setUint32(108, description.length * 2, true);
    [...name + description].forEach((char, i) => view.setUint16(112 + i * 2, char.charCodeAt(0), true));
    streams.set("Data", data);
    expect(formatDoc(streams).text).toBe("Logo [Image: Acme & Co] here.");
    // A hidden picture's alternative text is hidden text.
    const hidden = wordStreams([pieces[0]!, { ...pieces[1]!, hidden: true }, pieces[2]!], { body: 13 });
    hidden.set("Data", data);
    expect(formatDoc(hidden).text).toBe("Logo  here.");
    // Without its Data stream the picture is left out, as before.
    expect(formatDoc(wordStreams(pieces, { body: 13 })).text).toBe("Logo  here.");
  });

  it("writes a table's cells apart", () => {
    const body = "Region\x07Q1\x07\x07EMEA\x071200\x07\x07";
    const { text } = formatDoc(wordStreams([{ text: body }], { body: body.length }));
    expect(text).toBe("Region\tQ1\nEMEA\t1200");
  });

  it("names a password-protected document as such", () => {
    expect(() => formatDoc(wordStreams([{ text: "x\r" }], { body: 2 }, 0x0300))).toThrow(/password/i);
  });

  it("declines a Word 6 or 95 file, whose table it does not read, so the ledger can name it", () => {
    const streams = wordStreams([{ text: "Old.\r" }], { body: 5 });
    new DataView(streams.get("WordDocument")!.buffer).setUint16(2, 0x0065, true);
    expect(formatDoc(streams)).toEqual({ text: "", notes: [{ kind: "parser-unavailable" }] });
  });
});

/**
 * `streams` (one UTF-16 piece at 0x400) given paragraph list properties and
 * list tables: a PapxFkp page after the text, then PlcBtePapx, PlfLst with
 * its LVLs and PlfLfo with its LFOData appended to the table stream.
 */
function withLists(
  streams: Map<string, Uint8Array>,
  paragraphs: { text: string; ilfo?: number; ilvl?: number }[],
  lists: { lsid: number; levels: { nfc: number; text: string; start?: number }[] }[],
  lfos: { lsid: number; starts?: [number, number][] }[],
): Map<string, Uint8Array> {
  const textAt = 0x400;
  const old = streams.get("WordDocument")!;
  const pageAt = Math.ceil(old.length / 512) * 512;
  const word = new Uint8Array(pageAt + 512);
  word.set(old);
  const page = new DataView(word.buffer, pageAt, 512);
  let cp = 0;
  paragraphs.forEach((paragraph, run) => {
    page.setUint32(run * 4, textAt + cp * 2, true);
    cp += paragraph.text.length;
    const papx = 400 + run * 12;
    page.setUint8((paragraphs.length + 1) * 4 + run * 13, papx / 2);
    // cb 5: istd, sprmPIlfo and sprmPIlvl, 9 bytes.
    word.set([5, 0, 0, 0x0b, 0x46, paragraph.ilfo ?? 0, 0, 0x0a, 0x26, paragraph.ilvl ?? 0], pageAt + papx);
  });
  page.setUint32(paragraphs.length * 4, textAt + cp * 2, true);
  page.setUint8(511, paragraphs.length);

  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  const u32 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  const old2 = streams.get("1Table")!;
  const papxAt = old2.length;
  u32(textAt);
  u32(textAt + cp * 2);
  u32(pageAt / 512);
  const lstAt = old2.length + bytes.length;
  u16(lists.length);
  for (const list of lists) {
    u32(list.lsid);
    bytes.push(...new Array<number>(22).fill(0), list.levels.length === 1 ? 1 : 0, 0);
  }
  for (const list of lists) {
    for (const level of list.levels) {
      u32(level.start ?? 1);
      bytes.push(level.nfc, 0, ...new Array<number>(22).fill(0));
      u16(level.text.length);
      for (const c of level.text) u16(c.charCodeAt(0));
    }
  }
  const lfoAt = old2.length + bytes.length;
  u32(lfos.length);
  for (const lfo of lfos) {
    u32(lfo.lsid);
    bytes.push(...new Array<number>(8).fill(0), lfo.starts?.length ?? 0, 0, 0, 0);
  }
  for (const lfo of lfos) {
    u32(0);
    for (const [ilvl, start] of lfo.starts ?? []) {
      u32(start);
      bytes.push(ilvl | 0x10, 0, 0, 0);
    }
  }
  const table = new Uint8Array(old2.length + bytes.length);
  table.set(old2);
  table.set(bytes, old2.length);
  const fib = new DataView(word.buffer);
  fib.setUint16(0x98, 93, true);
  fib.setUint32(0x0102, papxAt, true);
  fib.setUint32(0x0106, 12, true);
  fib.setUint32(0x02e2, lstAt, true);
  fib.setUint32(0x02e6, 2 + lists.length * 28, true);
  fib.setUint32(0x02ea, lfoAt, true);
  fib.setUint32(0x02ee, table.length - lfoAt, true);
  return new Map([
    ["WordDocument", word],
    ["1Table", table],
  ]);
}

describe("formatDoc and lists", () => {
  it("opens each list paragraph with the label Word prints for it, from the list tables", () => {
    const paragraphs = [
      { text: "Terms\r" },
      { text: "Scope\r", ilfo: 1 },
      { text: "Parties\r", ilfo: 1, ilvl: 1 },
      { text: "Fees\r", ilfo: 1 },
      { text: "Again\r", ilfo: 1, ilvl: 1 },
      { text: "Fresh\r", ilfo: 2 },
      { text: "Dot\r", ilfo: 3 },
      { text: "\x10\x10\r", ilfo: 1 },
    ];
    const body = paragraphs.map((p) => p.text).join("");
    const lists = [
      { lsid: 7, levels: [{ nfc: 0, text: "Article \x00." }, { nfc: 4, text: "(\x01)" }, ...new Array(7).fill({ nfc: 0, text: "" })] },
      { lsid: 9, levels: [{ nfc: 23, text: "" }] },
    ];
    const lfos = [{ lsid: 7 }, { lsid: 7, starts: [[0, 5]] as [number, number][] }, { lsid: 9 }];
    const { text } = formatDoc(withLists(wordStreams([{ text: body }], { body: body.length }), paragraphs, lists, lfos));
    expect(text).toBe("Terms\nArticle 1. Scope\n    (a) Parties\nArticle 2. Fees\n    (a) Again\nArticle 5. Fresh\n- Dot");
  });
});
