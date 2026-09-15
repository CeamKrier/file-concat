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

  it("keeps the body, notes and text boxes, and leaves headers and comments out", () => {
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
