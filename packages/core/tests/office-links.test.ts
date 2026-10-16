import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { withoutHiddenText } from "../src/file-processing/parsers/office-hidden";
import { linkWorthWriting, withOdfFormValues, withWordFieldLinks, withWordFormFields } from "../src/file-processing/parsers/office-links";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { docxWithBody, odfDocument } from "./fixtures/containers";

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

const formField = (code: string, data: string, result = "", hidden = false) =>
  `<w:r>${hidden ? "<w:rPr><w:vanish/></w:rPr>" : ""}<w:fldChar w:fldCharType="begin"><w:ffData>${data}</w:ffData></w:fldChar></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${result}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const dropDown = (result: string) =>
  `<w:ddList>${result}<w:listEntry w:val="First"/><w:listEntry w:val="Second &amp; more"/></w:ddList>`;

describe("withWordFormFields", () => {
  it("writes a check box as [x] or [ ], w:checked before w:default", () => {
    const box = (data: string) => text(withWordFormFields(formField("FORMCHECKBOX", `<w:checkBox>${data}</w:checkBox>`)));
    expect(box('<w:default w:val="0"/><w:checked/>')).toBe("[x]");
    expect(box('<w:default w:val="1"/><w:checked w:val="false"/>')).toBe("[ ]");
    expect(box('<w:default w:val="1"/>')).toBe("[x]");
    expect(box("<w:sizeAuto/>")).toBe("[ ]");
  });

  it("writes a drop-down as its selected entry, the first without a result", () => {
    expect(text(withWordFormFields(formField("FORMDROPDOWN", dropDown('<w:result w:val="1"/>'))))).toBe("Second &#38; more");
    expect(text(withWordFormFields(formField("FORMDROPDOWN", dropDown(""))))).toBe("First");
  });

  it("leaves a hidden field, a field with a shown result and a text field as they are", () => {
    for (const xml of [
      formField("FORMCHECKBOX", "<w:checkBox><w:checked/></w:checkBox>", "", true),
      formField("FORMDROPDOWN", dropDown(""), r("Shown")),
      formField("FORMTEXT", "<w:textInput/>", r("Typed")),
    ]) {
      expect(withWordFormFields(xml)).toBe(xml);
    }
  });

  it("comes through a .docx and an .odt", async () => {
    const docx = docxWithBody(`<w:p>${formField("FORMCHECKBOX", "<w:checkBox><w:checked/></w:checkBox>")}${r(" QZLABEL")}</w:p>`);
    expect((await extractOfficeDocument(docx)).text).toContain("[x] QZLABEL");
    const ns = 'xmlns:form="urn:oasis:names:tc:opendocument:xmlns:form:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"';
    const odt = odfDocument(
      "text",
      `<office:forms ${ns}><form:form><form:text form:id="c1" form:current-value="QZCURRENT" form:value="QZDEFAULT"/></form:form></office:forms>` +
        `<text:p ${ns}>Form: <draw:control draw:control="c1"/></text:p>`,
    );
    expect((await extractOfficeDocument(odt)).text).toContain("Form: QZCURRENT");
  });
});

describe("withOdfFormValues", () => {
  const forms = (controls: string) => `<office:forms><form:form>${controls}</form:form></office:forms>`;

  it("writes a field's value and a check box's state where the control is drawn", () => {
    const xml =
      forms('<form:text form:id="a" form:value="Default"/><form:checkbox form:id="b" form:state="checked" form:current-state="unchecked"/>') +
      '<text:p><draw:control draw:control="a"/> <draw:control draw:control="b"></draw:control></text:p>';
    expect(withOdfFormValues(xml)).toContain("<text:p>Default [ ]</text:p>");
  });

  it("leaves a password, a list box and an unknown control drawn as they were", () => {
    const xml =
      forms('<form:password form:id="p" form:value="secret"/><form:listbox form:id="l"/>') +
      '<text:p><draw:control draw:control="p"/><draw:control draw:control="l"/><draw:control draw:control="x"/></text:p>';
    expect(withOdfFormValues(xml)).toBe(xml);
  });
});
