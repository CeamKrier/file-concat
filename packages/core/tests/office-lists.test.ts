import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { numberText, wordListLabels } from "../src/file-processing/parsers/office-lists";
import { docxWithBody } from "./fixtures/containers";

const lvl = (ilvl: number, format: string, text: string, extra = "") =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/>${extra}</w:lvl>`;
const numbering = (xml: string) =>
  zipSync({ "word/numbering.xml": strToU8(`<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:numbering>`) });

describe("wordListLabels", () => {
  it("formats each level its own way, restarts a deeper level after a higher one, and continues a shared list", () => {
    const label = wordListLabels(
      numbering(
        `<w:abstractNum w:abstractNumId="0">${lvl(0, "decimal", "%1.")}${lvl(1, "lowerLetter", "%2)")}${lvl(2, "upperRoman", "%1.%2.%3")}</w:abstractNum>` +
          `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>`,
      ),
    )!;
    const calls: [string, number][] = [["1", 0], ["1", 1], ["1", 2], ["1", 2], ["1", 1], ["1", 0], ["1", 1], ["2", 0], ["9", 0]];
    expect(calls.map(([id, level]) => label(id, level))).toEqual(["1.", "a)", "1.a.I", "1.a.II", "b)", "2.", "a)", "3.", undefined]);
  });

  it("honours lvlRestart 0, a startOverride where its list first appears, isLgl, bullets and a numStyleLink", () => {
    const label = wordListLabels(
      numbering(
        `<w:abstractNum w:abstractNumId="0">${lvl(0, "upperLetter", "%1.")}${lvl(1, "lowerRoman", "%1.%2", '<w:lvlRestart w:val="0"/><w:isLgl/>')}</w:abstractNum>` +
          `<w:abstractNum w:abstractNumId="1"><w:numStyleLink w:val="Legal"/></w:abstractNum>` +
          `<w:abstractNum w:abstractNumId="2"><w:styleLink w:val="Legal"/>${lvl(0, "decimalZero", "Clause %1")}${lvl(1, "bullet", "&#61623;")}</w:abstractNum>` +
          `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
          `<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>` +
          `<w:num w:numId="3"><w:abstractNumId w:val="1"/></w:num>`,
      ),
    )!;
    const calls: [string, number][] = [["1", 0], ["1", 1], ["1", 0], ["1", 1], ["2", 0], ["2", 0], ["3", 0], ["3", 1]];
    expect(calls.map(([id, level]) => label(id, level))).toEqual(["A.", "1.1", "B.", "2.2", "E.", "F.", "Clause 01", "-"]);
  });

  it("caps roman and letter numbers, and reads nothing without a numbering part", () => {
    expect([numberText(27, "lowerLetter"), numberText(1994, "upperRoman"), numberText(12, "ordinal"), numberText(23, "ordinal")]).toEqual(["aa", "MCMXCIV", "12th", "23rd"]);
    expect([numberText(2 ** 31, "upperRoman"), numberText(1e6, "lowerLetter"), numberText(3, "cardinalText")]).toEqual(["2147483648", "1000000", "3"]);
    expect(wordListLabels(zipSync({ "word/document.xml": strToU8("<w:document/>") }))).toBeUndefined();
  });
});

describe("extractOfficeDocument and Word lists", () => {
  it("writes each item's Word label, indented by level", async () => {
    const item = (num: string, ilvl: number, text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${num}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const parts = unzipSync(docxWithBody(item("1", 0, "Scope") + item("1", 1, "Terms") + item("1", 0, "Fees")));
    parts["word/numbering.xml"] = unzipSync(
      numbering(`<w:abstractNum w:abstractNumId="0">${lvl(0, "decimal", "Article %1.")}${lvl(1, "lowerLetter", "(%2)")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`),
    )["word/numbering.xml"];
    const { text } = await extractOfficeDocument(zipSync(parts));
    expect(text).toContain("Article 1. Scope\n    (a) Terms\nArticle 2. Fees");
  });
});
