import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { numberText, withOdfListLabels, wordListLabels } from "../src/file-processing/parsers/office-lists";
import { docxWithBody, odfDocument } from "./fixtures/containers";

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

  it("caps a label template, which is written before every item of its level", () => {
    const long = "x".repeat(100_000);
    const label = wordListLabels(numbering(`<w:abstractNum w:abstractNumId="0">${lvl(0, "decimal", `%1${long}`)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`))!;
    expect(label("1", 0)!.length).toBeLessThanOrEqual(64);
    const styles = `<text:list-style style:name="L"><text:list-level-style-number text:level="1" style:num-format="1" style:num-prefix="${long}" style:num-suffix="${long}"/></text:list-style>`;
    const out = withOdfListLabels(`<text:list text:style-name="L"><text:list-item><text:p>x</text:p></text:list-item></text:list>`, styles);
    expect(out.length).toBeLessThan(300);
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

describe("withOdfListLabels", () => {
  const item = (text: string, nested = "", attrs = "") => `<text:list-item${attrs}><text:p>${text}</text:p>${nested}</text:list-item>`;
  const paragraphs = (xml: string) => [...xml.matchAll(/<text:p>(.*?)<\/text:p>/g)].map((m) => m[1]);

  it("counts from the list style: format, prefix, suffix, display levels, start values, restarts and continued lists", () => {
    const styles =
      '<text:list-style style:name="L1"><text:list-level-style-number text:level="1" style:num-format="A" style:num-prefix="(" style:num-suffix=")"/>' +
      '<text:list-level-style-number text:level="2" style:num-format="i" style:num-suffix="." text:display-levels="2" text:start-value="2"/></text:list-style>' +
      '<text:list-style style:name="B"><text:list-level-style-bullet text:level="1" text:bullet-char="*"/></text:list-style>';
    const content =
      `<text:list text:style-name="L1">${item("One", `<text:list>${item("Sub")}${item("Sub two")}</text:list>`)}${item("Two", `<text:list>${item("Again")}</text:list>`)}</text:list>` +
      `<text:p>Between</text:p><text:list text:style-name="L1" text:continue-numbering="true">${item("Three")}${item("Seven", "", ' text:start-value="7"')}</text:list>` +
      `<text:list text:style-name="L1">${item("Fresh")}</text:list><text:list text:style-name="B">${item("Dot")}</text:list><text:list>${item("Unstyled")}</text:list>`;
    const out = withOdfListLabels(content, `<office:styles>${styles}</office:styles>`);
    expect(out).not.toMatch(/text:list text:style-name/);
    expect(paragraphs(out)).toEqual([
      "(A) One", '<text:s text:c="4"/>A.ii. Sub', '<text:s text:c="4"/>A.iii. Sub two', "(B) Two", '<text:s text:c="4"/>B.ii. Again',
      "Between", "(C) Three", "(G) Seven", "(A) Fresh", "- Dot", "- Unstyled",
    ]);
  });

  it("stops indents and multi-level labels at ten levels however deep a list nests", () => {
    const depth = 5000;
    const styles = '<text:list-style style:name="L"><text:list-level-style-number text:level="1" style:num-format="1" text:display-levels="9999"/></text:list-style>';
    const content = `${'<text:list text:style-name="L"><text:list-item><text:p>x</text:p>'.repeat(depth)}${"</text:list-item></text:list>".repeat(depth)}`;
    const out = withOdfListLabels(content, styles);
    expect(out.length).toBeLessThan(content.length + depth * 40);
    expect(out).not.toMatch(/text:c="(?!40")\d{3,}"/);
  });

  it("prefers the number the writer cached, and reads it into the text an LLM gets", async () => {
    const body =
      '<text:list text:style-name="Undefined"><text:list-header><text:p>Steps</text:p></text:list-header>' +
      `<text:list-item text:start-value="7"><text:number>7.</text:number><text:p>Seventh</text:p>` +
      `<text:list><text:list-item><text:number>7.1.</text:number><text:p>Nested &amp; more</text:p></text:list-item></text:list></text:list-item></text:list>`;
    const { text } = await extractOfficeDocument(odfDocument("text", body));
    expect(text).toContain("Steps\n7. Seventh\n    7.1. Nested & more");
  });
});
