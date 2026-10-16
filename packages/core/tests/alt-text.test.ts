import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { altLabel, withOdfAltText, withRtfAltText, withWordAltText } from "../src/file-processing/parsers/alt-text";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { workbookSheets } from "../src/file-processing/parsers/office-charts";
import { withoutHiddenText } from "../src/file-processing/parsers/office-hidden";
import { chartedXlsx, odfDocument } from "./fixtures/containers";

describe("altLabel", () => {
  it("joins title and description, once each, on one line", () => {
    expect(altLabel("Image", ["Sales chart", "Bars rising\nby quarter", "Sales chart"])).toBe("[Image: Sales chart; Bars rising by quarter]");
  });

  it("is empty for nothing, a writer's default name or a file name", () => {
    for (const parts of [[], [undefined, ""], ["Picture 3"], ["Resim 12"], ["image1.png"], ["  "]]) expect(altLabel("Image", parts)).toBe("");
  });
});

describe("withWordAltText", () => {
  const picture = (docPr: string) =>
    `<w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" ${docPr}/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"/></a:graphic></wp:inline></w:drawing>`;

  it("writes a picture's alternative text after the run that holds it", () => {
    const xml = `<w:p><w:r><w:t>Before</w:t></w:r><w:r>${picture('title="T &amp; U" descr="D"')}</w:r><w:r><w:t>After</w:t></w:r></w:p>`;
    expect(withWordAltText(xml)).toBe(
      `<w:p><w:r><w:t>Before</w:t></w:r><w:r>${picture('title="T &amp; U" descr="D"')}</w:r><w:r><w:t>[Image: T &#38; U; D]</w:t></w:r><w:r><w:t>After</w:t></w:r></w:p>`,
    );
  });

  it("leaves a chart to its own label and writes a Fallback copy nothing", () => {
    const chart = `<w:r><w:drawing><wp:docPr id="2" descr="Chart alt"/><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></w:drawing></w:r>`;
    expect(withWordAltText(chart)).toBe(chart);
    const fallback = `<w:r><mc:AlternateContent><mc:Choice>${picture('descr="Once"')}</mc:Choice><mc:Fallback><w:pict><v:shape alt="Once"><v:textbox><w:p><w:r><w:t>x</w:t></w:r></w:p></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
    expect(withWordAltText(fallback).match(/\[Image: Once\]/g)).toHaveLength(1);
    expect(withWordAltText(fallback).endsWith("</w:r><w:r><w:t>[Image: Once]</w:t></w:r>")).toBe(true);
  });

  it("names a SmartArt diagram, with or without its alternative text", () => {
    const diagram = (docPr: string) =>
      `<w:r><w:drawing><wp:docPr id="3" name="Diagram 3"${docPr}/><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></w:drawing></w:r>`;
    expect(withWordAltText(diagram(' descr="Process"'))).toBe(`${diagram(' descr="Process"')}<w:r><w:t>[Diagram: Process]</w:t></w:r>`);
    expect(withWordAltText(diagram(""))).toBe(`${diagram("")}<w:r><w:t>[Diagram]</w:t></w:r>`);
  });

  it("skips a picture in a hidden run, a tracked deletion or the source of a move", () => {
    for (const xml of [
      `<w:r><w:rPr><w:vanish/></w:rPr>${picture('descr="Secret"')}</w:r>`,
      `<w:del w:id="1"><w:r>${picture('descr="Secret"')}</w:r></w:del>`,
      `<w:moveFrom w:id="2"><w:r>${picture('descr="Secret"')}</w:r></w:moveFrom>`,
      `<w:r>${picture('descr="Secret" hidden="1"')}</w:r>`,
      `<w:r><w:pict><v:shape alt="Secret" style="width:10pt;visibility:hidden"/></w:pict></w:r>`,
    ]) {
      expect(withWordAltText(xml)).toBe(xml);
    }
    // Shown again with w:val="0", and a hidden paragraph mark in a text box hides no picture.
    expect(withWordAltText(`<w:r><w:rPr><w:vanish w:val="0"/></w:rPr>${picture('descr="Shown"')}</w:r>`)).toContain("[Image: Shown]");
    const box = `<w:r><w:drawing><wp:docPr id="4" descr="Boxed"/><w:txbxContent><w:p><w:pPr><w:rPr><w:vanish/></w:rPr></w:pPr></w:p></w:txbxContent></w:drawing></w:r>`;
    expect(withWordAltText(box)).toContain("[Image: Boxed]");
  });

  it("reads a VML picture's alt and a picture inside a text box", () => {
    expect(withWordAltText(`<w:r><w:pict><v:shape alt="Logo of the firm"><v:imagedata o:title="logo"/></v:shape></w:pict></w:r>`)).toContain(
      "[Image: Logo of the firm; logo]",
    );
    const inner = `<w:r><w:drawing><wp:docPr id="3" descr="Outer"/><w:txbxContent><w:p><w:r>${picture('descr="Inner"')}</w:r></w:p></w:txbxContent></w:drawing></w:r>`;
    const out = withWordAltText(inner);
    expect(out.indexOf("[Image: Inner]")).toBeLessThan(out.indexOf("[Image: Outer]"));
  });

  it("writes a table's caption and description above it", () => {
    const xml = `<w:tbl><w:tblPr><w:tblCaption w:val="Prices"/><w:tblDescription w:val="Per region"/></w:tblPr><w:tr/></w:tbl>`;
    expect(withWordAltText(xml)).toBe(`<w:p><w:r><w:t xml:space="preserve">[Table: Prices; Per region]</w:t></w:r></w:p>${xml}`);
    expect(withWordAltText("<w:tbl><w:tr/></w:tbl>")).toBe("<w:tbl><w:tr/></w:tbl>");
  });
});

describe("withOdfAltText", () => {
  it("joins a frame's description to its title, or makes it the title", () => {
    expect(withOdfAltText(`<draw:frame><draw:image/><svg:title>T</svg:title><svg:desc>D &amp; E</svg:desc></draw:frame>`)).toBe(
      `<draw:frame><draw:image/><svg:title>T; D &#38; E</svg:title></draw:frame>`,
    );
    expect(withOdfAltText(`<draw:frame><draw:image/><svg:desc>Only</svg:desc></draw:frame>`)).toBe(
      `<draw:frame><draw:image/><svg:title>Only</svg:title></draw:frame>`,
    );
  });

  it("does not take a nested shape's description for the frame's", () => {
    const xml = `<draw:frame><draw:text-box><draw:custom-shape><svg:desc>Inner</svg:desc></draw:custom-shape></draw:text-box></draw:frame>`;
    expect(withOdfAltText(xml)).toBe(xml);
  });

  it("writes a text document's table title and description above the table", () => {
    const xml = `<office:text><table:table table:name="T1"><table:title>Prices</table:title><table:desc>Per region</table:desc></table:table></office:text>`;
    expect(withOdfAltText(xml)).toBe(
      `<office:text><text:p>[Table: Prices; Per region]</text:p><table:table table:name="T1"><table:title>Prices</table:title><table:desc>Per region</table:desc></table:table></office:text>`,
    );
  });

  it("carries a link's title, a footnote's own mark and an image's text to where officeparser writes them", async () => {
    const ns =
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
    const odt = odfDocument(
      "text",
      `<text:p ${ns}>See <text:a xlink:type="simple" xlink:href="https://e.example/p" office:title="Say &quot;hi&quot;">docs</text:a>.</text:p>` +
        `<text:p ${ns}>Claim<text:note text:id="n1" text:note-class="footnote"><text:note-citation text:label="*">*</text:note-citation><text:note-body><text:p>Source.</text:p></text:note-body></text:note> made.</text:p>` +
        `<text:p ${ns}><draw:frame draw:name="Image1"><draw:image xlink:href="Pictures/a.png"><text:p>On the picture</text:p></draw:image><svg:title>Chart</svg:title></draw:frame></text:p>`,
    );
    const { text } = await extractOfficeDocument(odt);
    expect(text).toContain('See [docs](https://e.example/p "Say \\"hi\\"").');
    expect(text).toContain("Claim*[^1] made.");
    expect(text).toMatch(/\[Image: Chart\]\s*On the picture/);
    expect(text).not.toContain("\uE002");
  });
});

describe("withRtfAltText", () => {
  it("writes a picture's description after its group, once, in the document's code page", () => {
    const pict = String.raw`{\*\shppict{\pict{\*\picprop{\sp{\sn wzDescription}{\sv Ka\'fe \{x\}}}}\pngblip 8950}}{\nonshppict{\pict{\*\picprop{\sp{\sn wzDescription}{\sv Old}}}\wmetafile8 0100}}`;
    const rtf = String.raw`{\rtf1\ansi\ansicpg1254 Before ${pict} after.\par}`;
    expect(strFromU8(withRtfAltText(strToU8(rtf)), true)).toBe(String.raw`{\rtf1\ansi\ansicpg1254 Before ${pict.replace("}}{\\nonshppict", "}}{[Image: Ka\\u351? \\{x\\}]}{\\nonshppict")} after.\par}`);
  });

  it("leaves a hidden or deleted picture's description out with the rest of its text", () => {
    const pict = String.raw`{\*\shppict{\pict{\*\picprop{\sp{\sn wzDescription}{\sv Secret}}}\pngblip 89}}`;
    for (const rtf of [String.raw`{\rtf1 A {\v ${pict}} B\par}`, String.raw`{\rtf1 A \v ${pict}\v0  B\par}`, String.raw`{\rtf1 A {\deleted ${pict}} B\par}`]) {
      expect(strFromU8(withoutHiddenText(strToU8(rtf)).bytes, true)).not.toContain("[Image: Secret]");
    }
    expect(strFromU8(withoutHiddenText(strToU8(String.raw`{\rtf1 A ${pict} B\par}`)).bytes, true)).toContain("{[Image: Secret]}");
  });

  it("leaves a picture without a description alone", () => {
    const rtf = String.raw`{\rtf1 {\pict{\*\picprop{\sp{\sn wzDescription}{\sv Picture 2}}}\pngblip 89}}`;
    expect(strFromU8(withRtfAltText(strToU8(rtf)), true)).toBe(rtf);
  });
});

describe("workbook drawings", () => {
  it("labels a picture's alternative text after its sheet, and not a hidden picture's", () => {
    const parts = unzipSync(chartedXlsx());
    const pic = (cNvPr: string) =>
      `<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="1" cy="1"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr ${cNvPr}/><xdr:cNvPicPr/></xdr:nvPicPr></xdr:pic><xdr:clientData/></xdr:absoluteAnchor>`;
    parts["xl/drawings/drawing1.xml"] = strToU8(
      strFromU8(parts["xl/drawings/drawing1.xml"]!).replace(
        "</xdr:wsDr>",
        `${pic('id="5" name="Picture 4" title="Logo" descr="Acme &amp; Co"')}${pic('id="6" name="Picture 5" descr="Secret" hidden="1"')}</xdr:wsDr>`,
      ),
    );
    const labels = workbookSheets(zipSync(parts)).sheets[0]!.blocks.map((block) => block.label);
    expect(labels).toContain("[Image: Logo; Acme & Co]");
    expect(labels.join()).not.toContain("Secret");
  });
});
