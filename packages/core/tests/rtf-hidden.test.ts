import { strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
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
    const started = performance.now();
    expect(withoutHiddenRtf(rtf(`\\v ${"word \\'e9 ".repeat(500_000)}`)).hidden).toBe(1);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
