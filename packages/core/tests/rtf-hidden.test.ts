import { strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { rtfBody } from "../src/file-processing/parsers/msg-rtf";
import { withRtfComments } from "../src/file-processing/parsers/rtf-comments";
import { withRtfFurniture } from "../src/file-processing/parsers/rtf-furniture";
import { withoutHiddenRtf } from "../src/file-processing/parsers/rtf-hidden";

const rtf = (body: string) => strToU8(`{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\stylesheet{\\s1\\v Hidden style;}}${body}}`);
const strip = (body: string) => {
  const { bytes, hidden } = withoutHiddenRtf(rtf(body));
  return { text: strFromU8(bytes).replace(/^.*?\{\\stylesheet\{\\s1\\v Hidden style;\}\}/, ""), hidden };
};

describe("withoutHiddenRtf", () => {
  it("drops hidden and deleted text, keeping marks, destinations and the words around it", () => {
    expect(strip("\\pard A {\\v QZHIDDEN} B {\\deleted QZDELETED} C\\par")).toEqual({ text: "\\pard A {\\v } B {\\deleted } C\\par}", hidden: 1 });
    // Escapes, \u with its fallback, symbols and character words go with it; the paragraph mark stays.
    expect(strip("{\\v x\\'e9\\u305?\\~\\{\\emdash\\par y}z")).toEqual({ text: "{\\v \\par }z}", hidden: 1 });
    // A field's instruction is a destination and stays.
    expect(strip("{\\v{\\field{\\*\\fldinst HYPERLINK \"u\"}{\\fldrslt QZ}}}").text).toBe("{\\v{\\field{\\*\\fldinst HYPERLINK \"u\"}{\\fldrslt }}}}");
  });

  it("follows \\v0, \\plain and the group a \\v ends with, and counts stretches", () => {
    expect(strip("\\v ONE\\v0 two \\v THREE\\plain four {\\v FIVE}six")).toEqual({ text: "\\v \\v0 two \\v \\plain four {\\v }six}", hidden: 3 });
  });

  it("hands back the same bytes when nothing is hidden, and skips \\bin data", () => {
    const plain = rtf("\\pard Plain {\\b bold}\\par");
    expect(withoutHiddenRtf(plain).bytes).toBe(plain);
    expect(strip("\\v {\\bin3 a}b}c").text).toBe("\\v {\\bin3 a}b}}");
  });

  it("scans a long hidden run in linear time", () => {
    const long = rtf(`\\v ${"word \\'e9 ".repeat(500_000)}`);
    const started = performance.now();
    expect(withoutHiddenRtf(long).hidden).toBe(1);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("withRtfComments", () => {
  // Read back the way a reader would: destinations skipped, 8-bit text as Latin-1.
  const read = (body: string) => {
    const { bytes, comments } = withRtfComments(rtf(body));
    return { text: rtfBody(withoutHiddenRtf(bytes).bytes, (b) => strFromU8(b, true)).text.trim(), comments };
  };
  const note = (author: string, body: string) =>
    `{\\*\\atnid AY}{\\*\\atnauthor ${author}}\\chatn{\\*\\annotation{\\*\\atndate 1}\\pard\\plain ${body}}`;

  it("writes a comment at the end of its paragraph, author named, and counts it", () => {
    expect(read(`\\pard Anchor${note("Ada Y\\'fclmaz", "Check\\par this.")} after.\\par Next.\\par`)).toEqual({
      text: "Anchor after. [Comment, Ada Y\u00fclmaz: Check this.]\nNext.",
      comments: 1,
    });
  });

  it("labels a reply, falls back to the initials, drops hidden text and skips an empty comment", () => {
    const reply = `{\\*\\atnid QA}\\chatn{\\*\\annotation{\\*\\atnparent 1}\\pard Yes{\\v QZHIDDEN}.}`;
    const empty = `{\\*\\atnauthor Bo}\\chatn{\\*\\annotation{\\*\\atndate 2} }`;
    expect(read(`\\pard One${reply}${empty} two`)).toEqual({ text: "One two [Reply, QA: Yes.]", comments: 1 });
  });

  it("hands back the same bytes when there is no comment, and reads a long one in linear time", () => {
    const plain = rtf("\\pard Plain {\\b bold}\\par");
    expect(withRtfComments(plain).bytes).toBe(plain);
    const long = rtf(`\\pard A${note("Ada", "word \\par ".repeat(50_000))}\\par`);
    const started = performance.now();
    expect(withRtfComments(long).comments).toBe(1);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("withRtfFurniture", () => {
  const read = (body: string) => rtfBody(withoutHiddenRtf(withRtfFurniture(rtf(body))).bytes, (b) => strFromU8(b, true)).text.trim();

  it("writes each distinct header and footer once, labelled, headers first and footers last", () => {
    const furniture =
      "{\\header \\pard\\plain Head one\\par two\\par}{\\headerf \\pard Cover}{\\headerl \\pard\\b Head one\\b0  two}" +
      "{\\footer \\pard Page {\\v QZHIDDEN}{\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}}{\\footerr \\pard }";
    expect(read(`\\sectd${furniture}\\pard Body\\par`)).toBe(
      "--- Page header ---\nHead one two\nCover\nBody\n--- Page footer ---\nPage 1",
    );
  });

  it("hands back the same bytes when there is none, or the file is no RTF", () => {
    const plain = rtf("\\pard Plain\\par");
    expect(withRtfFurniture(plain)).toBe(plain);
    const binary = Uint8Array.from([0xd0, 0xcf, 0x7b, 0x5c, 0x68, 0x65, 0x61, 0x64, 0x65, 0x72, 0x20, 0x78, 0x7d]);
    expect(withRtfFurniture(binary)).toBe(binary);
  });
});
