import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { withoutHiddenText } from "../src/file-processing/parsers/office-hidden";
import { linkWorthWriting, withWordFieldLinks } from "../src/file-processing/parsers/office-links";

const r = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const field = (code: string, result: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${code}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${result}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const text = (xml: string) => Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (m) => m[1]).join("");

describe("withWordFieldLinks", () => {
  it("writes a HYPERLINK field as [text](address), across its result runs", () => {
    const xml = `<w:p>${r("See ")}${field(' HYPERLINK "https://example.com/a?b=1&amp;c=2" \\o "Tip" ', r("our ") + r("docs"))}${r(".")}</w:p>`;
    expect(text(withWordFieldLinks(xml))).toBe("See [our docs](https://example.com/a?b=1&#38;c=2).");
  });

  it("appends a \\l location as a fragment, and reads a simple field", () => {
    expect(text(withWordFieldLinks(field('HYPERLINK "https://x.example/p" \\l "part2"', r("Part 2"))))).toBe("[Part 2](https://x.example/p#part2)");
    expect(text(withWordFieldLinks(`<w:fldSimple w:instr=" HYPERLINK &quot;https://s.example/&quot; ">${r("Simple")}</w:fldSimple>`))).toBe("[Simple](https://s.example/)");
  });

  it("skips a bookmark-only link, another field, an empty result and a result that is the address", () => {
    for (const xml of [
      field('HYPERLINK \\l "_Toc1"', r("Chapter 1")),
      field("PAGE", r("3")),
      field('HYPERLINK "https://e.example/"', r("")),
      field('HYPERLINK "https://e.example/"', r("https://e.example/")),
    ]) {
      expect(withWordFieldLinks(xml)).toBe(xml);
    }
  });

  it("leaves a hidden link's text out with its brackets, and an address past the cap as plain text", () => {
    const hidden = `<w:p>${field('HYPERLINK "https://h.example/"', "<w:r><w:rPr><w:vanish/></w:rPr><w:t>QZHIDDENLINK</w:t></w:r>")}</w:p>`;
    const docx = zipSync({ "word/document.xml": strToU8(hidden) });
    expect(strFromU8(unzipSync(withoutHiddenText(docx).bytes)["word/document.xml"]!)).not.toMatch(/\[|QZHIDDENLINK/);
    expect(linkWorthWriting("Docs", `https://x.example/${"a".repeat(2048)}`)).toBe(false);
  });

  it("wraps a link nested in another field's result once", () => {
    const xml = field("QUOTE x", field('HYPERLINK "https://n.example/"', r("inner")));
    expect(text(withWordFieldLinks(xml))).toBe("[inner](https://n.example/)");
  });
});
