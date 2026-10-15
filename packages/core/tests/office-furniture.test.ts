import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { nameBlocks, sheetHeaderText, workbookSheets } from "../src/file-processing/parsers/office-charts";
import { biffSheetFurniture, odsSheetFurniture, odsValidations, slideMasterText } from "../src/file-processing/parsers/office-furniture";
import { deckPptx, odfDocument, twoSheetXlsx } from "./fixtures/containers";

describe("sheetHeaderText", () => {
  it("keeps each section's text and drops fields, fonts, sizes and colours", () => {
    expect(sheetHeaderText('&L&"Arial,Bold"&12Left &&Co&C&P of &N&R&KFF0000Right&D')).toBe("Left &Co | of | Right");
    expect(sheetHeaderText("&K01+50Tinted &P+1next")).toBe("Tinted next");
    expect(sheetHeaderText("Centred")).toBe("Centred");
    expect(sheetHeaderText("&P&N&D&T")).toBe("");
  });
});

describe("workbook print headers", () => {
  const xlsx = () => {
    const parts = unzipSync(twoSheetXlsx());
    const add = (part: string, xml: string) => {
      parts[part] = strToU8(new TextDecoder().decode(parts[part]).replace("</worksheet>", `${xml}</worksheet>`));
    };
    add(
      "xl/worksheets/sheet1.xml",
      '<headerFooter differentFirst="1"><oddHeader>&amp;LAcme&amp;RConfidential</oddHeader><oddFooter>Page &amp;P</oddFooter>' +
        "<evenHeader>Not printed</evenHeader><firstHeader>Cover</firstHeader></headerFooter>",
    );
    add("xl/worksheets/sheet2.xml", "<headerFooter><oddFooter>Page &amp;P</oddFooter></headerFooter>");
    return zipSync(parts);
  };

  it("labels an xlsx sheet's header and footer after its rows, each once across the workbook", async () => {
    expect(workbookSheets(xlsx()).sheets.map((sheet) => sheet.blocks.map((block) => block.label))).toEqual([
      ["[Page header: Acme | Confidential]", "[Page footer: Page]", "[Page header: Cover]"],
      [],
    ]);
    const { text } = await extractOfficeDocument(xlsx());
    expect(text).toMatch(/APAC,980,1105\n\[Page header: Acme \| Confidential\],*\n/);
  });

  it("reads an xls sheet's Header and Footer records, once each, and nothing from an encrypted one", () => {
    const record = (type: number, data: number[] = []) => [type & 0xff, type >> 8, data.length & 0xff, data.length >> 8, ...data];
    const bof = record(0x0809, [0x00, 0x06, 0x10, 0x00, ...new Array<number>(12).fill(0)]);
    const eof = record(0x000a);
    const ansi = (s: string) => [...s].map((c) => c.charCodeAt(0));
    const utf16 = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);
    const header = (type: number, s: string, wide = false) =>
      record(type, [s.length & 0xff, s.length >> 8, wide ? 1 : 0, ...(wide ? utf16(s) : ansi(s))]);
    const sheetA = [...bof, ...header(0x0014, "&LAcme&RCo", true), ...header(0x0015, "Page &P"), ...bof, ...header(0x0014, "Chart head"), ...eof, ...eof];
    const sheetB = [...bof, ...header(0x0015, "Page &P"), ...record(0x0014), ...eof];
    const bound = (at: number, name: string) => record(0x0085, [at & 0xff, (at >> 8) & 0xff, 0, 0, 0, 0, name.length, 0, ...ansi(name)]);
    const globalsLength = (names: string[]) => bof.length + eof.length + names.reduce((sum, name) => sum + 4 + 8 + name.length, 0);
    const workbook = (extra: number[] = []) => {
      const start = globalsLength(["One", "Two", "Forged"]) + extra.length;
      return Uint8Array.from([
        ...bof,
        ...extra,
        ...bound(start, "One"),
        ...bound(start + sheetA.length, "Two"),
        // A second name pointing at the first sheet reads nothing again.
        ...bound(start, "Forged"),
        ...eof,
        ...sheetA,
        ...sheetB,
      ]);
    };
    const labels = (map: Map<string, { label: string }[]>) => Object.fromEntries([...map].map(([name, blocks]) => [name, blocks.map((b) => b.label)]));
    expect(labels(biffSheetFurniture(workbook()))).toEqual({ One: ["[Page header: Acme | Co]", "[Page footer: Page]"] });
    expect(biffSheetFurniture(workbook(record(0x002f, [0, 0])))).toEqual(new Map());
  });

  it("reads an ODS sheet's master page header and footer, regions apart, fields and switched-off ones left out", async () => {
    const masters =
      '<style:master-page style:name="Default"><style:header><style:region-left><text:p>Acme</text:p></style:region-left>' +
      "<style:region-center><text:p><text:sheet-name>???</text:sheet-name></text:p></style:region-center></style:header>" +
      '<style:footer><text:p>Page <text:page-number>1</text:page-number></text:p></style:footer><style:footer-left style:display="false"><text:p>Off</text:p></style:footer-left></style:master-page>' +
      '<style:master-page style:name="Wide"><style:header><text:p>Wide head</text:p></style:header></style:master-page>';
    const table = (name: string, style = "") =>
      `<table:table table:name="${name}"${style ? ` table:style-name="${style}"` : ""}><table:table-row><table:table-cell office:value-type="string"><text:p>${name} cell</text:p></table:table-cell></table:table-row></table:table>`;
    const styled = odfDocument(
      "spreadsheet",
      '<style:style style:name="ta2" style:family="table" style:master-page-name="Wide"/>' + table("One") + table("Two", "ta2") + table("Three"),
      masters,
    );
    expect(Object.fromEntries(odsSheetFurniture(styled))).toEqual({
      One: ["[Page header: Acme]", "[Page footer: Page]"],
      Two: ["[Page header: Wide head]"],
    });
    const { text } = await extractOfficeDocument(odfDocument("spreadsheet", table("One"), masters));
    expect(text).toContain("One cell\n[Page header: Acme]\n[Page footer: Page]");
  });
});

describe("validation rules and defined names", () => {
  const xlsx = () => {
    const parts = unzipSync(twoSheetXlsx());
    const edit = (part: string, from: string, to: string) => {
      parts[part] = strToU8(new TextDecoder().decode(parts[part]).replace(from, to));
    };
    edit(
      "xl/worksheets/sheet1.xml",
      "</worksheet>",
      "<dataValidations>" +
        '<dataValidation type="list" showInputMessage="1" showErrorMessage="1" promptTitle="Region" prompt="Pick one" errorTitle="No" error="Not a region" sqref="A2:A4 C1">' +
        "<formula1>\"EMEA,APAC\"</formula1></dataValidation>" +
        // A prompt Excel does not show, on a rule that is no list: nothing to say.
        '<dataValidation type="whole" prompt="Switched off" sqref="B2"><formula1>0</formula1></dataValidation>' +
        "</dataValidations>" +
        '<extLst><ext><x14:dataValidations><x14:dataValidation type="list"><x14:formula1><xm:f>Headcount!$A$1:$A$3</xm:f></x14:formula1>' +
        "<xm:sqref>D2</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst></worksheet>",
    );
    edit(
      "xl/workbook.xml",
      "</sheets>",
      "</sheets><definedNames>" +
        '<definedName name="Total" comment="Sum of &amp; regions">Headcount!$B$2</definedName>' +
        '<definedName name="Rate" localSheetId="0">0.2</definedName>' +
        '<definedName name="_xlnm.Print_Area" localSheetId="0">Revenue!$A$1:$C$4</definedName>' +
        '<definedName name="Secret" hidden="1">Revenue!$A$1</definedName>' +
        "</definedNames>",
    );
    return zipSync(parts);
  };

  it("labels an xlsx sheet's validation rules and the names that point into it", async () => {
    expect(workbookSheets(xlsx()).sheets.map((sheet) => sheet.blocks.map((block) => block.label))).toEqual([
      [
        "[Validation, A2:A4 C1: Region: Pick one; allowed: EMEA, APAC; error: No: Not a region]",
        "[Validation, D2: allowed: values in Headcount!$A$1:$A$3]",
        "[Name: Rate = 0.2]",
      ],
      ["[Name: Total = Headcount!$B$2; Sum of & regions]"],
    ]);
    const { text } = await extractOfficeDocument(xlsx());
    expect(text).toContain('"[Validation, A2:A4 C1: Region: Pick one; allowed: EMEA, APAC; error: No: Not a region]"');
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("Print_Area");
  });

  it("reads an xls sheet's Dv record, its explicit list and the ranges it covers", () => {
    const record = (type: number, data: number[] = []) => [type & 0xff, type >> 8, data.length & 0xff, data.length >> 8, ...data];
    const bof = record(0x0809, [0x00, 0x06, 0x10, 0x00, ...new Array<number>(12).fill(0)]);
    const eof = record(0x000a);
    const ansi = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
    const u16 = (n: number) => [n & 0xff, n >> 8];
    const string = (s: string) => [...u16(s.length), 0, ...ansi(s)];
    const list = [0x17, 9, 0, ...ansi("Yes\0No\0Na")];
    // List type 3, explicit strings, prompt shown, error not raised.
    const flags = [0x83, 0x00, 0x04, 0x00];
    const dv = record(0x01be, [
      ...flags,
      ...string("Answer"),
      ...string("\0"),
      ...string("Yes or no"),
      ...string("Wrong"),
      ...u16(list.length),
      0,
      0,
      ...list,
      0,
      0,
      0,
      0,
      ...u16(1),
      ...u16(1),
      ...u16(3),
      ...u16(2),
      ...u16(2),
    ]);
    const sheet = [...bof, ...dv, ...eof];
    const start = bof.length + 4 + 8 + 3 + eof.length;
    const bound = record(0x0085, [start & 0xff, start >> 8, 0, 0, 0, 0, 3, 0, ...ansi("One")]);
    const found = biffSheetFurniture(Uint8Array.from([...bof, ...bound, ...eof, ...sheet]));
    expect(found.get("One")?.map((block) => block.label)).toEqual(["[Validation, C2:C4: Answer: Yes or no; allowed: Yes, No, Na]"]);
  });

  it("places names by their own sheet, the sheet their reference names, or the first", () => {
    const labels = nameBlocks(
      [
        { name: "Local", ref: "1", sheet: 1 },
        { name: "Quoted", ref: "'It''s'!$A$1" },
        { name: "Elsewhere", ref: "Gone!$A$1" },
        { name: "_xlnm._FilterDatabase", ref: "One!$A$1" },
      ],
      ["One", "It's"],
    );
    expect(Object.fromEntries(Array.from(labels).map(([sheet, blocks]) => [sheet, blocks.map((block) => block.label)]))).toEqual({
      "It's": ["[Name: Local = 1]", "[Name: Quoted = 'It''s'!$A$1]"],
      One: ["[Name: Elsewhere = Gone!$A$1]"],
    });
  });

  it("writes an ODS rule's help and error messages under each sheet that uses it, once", async () => {
    const rules =
      '<table:content-validations><table:content-validation table:name="v1" table:condition="of:cell-content-is-in-list(&quot;Low&quot;;&quot;High&quot;)">' +
      '<table:help-message table:title="Level" table:display="true"><text:p>Pick a</text:p><text:p>level</text:p></table:help-message>' +
      '<table:error-message table:title="Off" table:display="false"><text:p>Not shown</text:p></table:error-message>' +
      "</table:content-validation>" +
      '<table:content-validation table:name="v2"><table:error-message table:title="Bad"/></table:content-validation></table:content-validations>';
    const cell = (rule = "") => `<table:table-cell${rule ? ` table:content-validation-name="${rule}"` : ""} office:value-type="string"><text:p>x</text:p></table:table-cell>`;
    const ods = odfDocument(
      "spreadsheet",
      rules +
        `<table:table table:name="One"><table:table-row>${cell("v1")}${cell("v1")}</table:table-row></table:table>` +
        `<table:table table:name="Two"><table:table-row>${cell("v2")}${cell()}</table:table-row></table:table>`,
    );
    expect(Object.fromEntries(odsValidations(ods))).toEqual({
      One: ["[Validation: Level: Pick a level; allowed: Low, High]"],
      Two: ["[Validation: error: Bad]"],
    });
    const { text } = await extractOfficeDocument(ods);
    expect(text).toContain("[Validation: Level: Pick a level; allowed: Low, High]");
    expect(text).not.toContain("Not shown");
  });
});

describe("slideMasterText", () => {
  const rels = (type: string, target: string) =>
    strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`,
    );
  const tree = (shapes: string) =>
    strToU8(
      `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        `<p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sldMaster>`,
    );
  const shape = (body: string, nv = "") => `<p:sp><p:nvSpPr><p:cNvPr id="3" name="s"${nv}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody>${body}</p:txBody></p:sp>`;
  const placeholder = (text: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const pptx = () => {
    const parts = unzipSync(deckPptx([{ shapes: [{ lines: ["First slide"] }] }, { shapes: [{ lines: ["Second slide"] }] }]));
    for (const n of [1, 2]) parts[`ppt/slides/_rels/slide${n}.xml.rels`] = rels("slideLayout", "../slideLayouts/slideLayout1.xml");
    parts["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = rels("slideMaster", "../slideMasters/slideMaster1.xml");
    parts["ppt/slideLayouts/slideLayout1.xml"] = tree(placeholder("Click to add title") + shape("<a:p><a:r><a:t>Layout band</a:t></a:r></a:p>"));
    parts["ppt/slideMasters/slideMaster1.xml"] = tree(
      placeholder("Master prompt") +
        shape("<a:p><a:r><a:t>Acme</a:t></a:r><a:br/><a:r><a:t>Corp</a:t></a:r></a:p>") +
        shape('<a:p><a:fld id="{1}" type="slidenum"><a:t>3</a:t></a:fld></a:p>') +
        shape("<a:p><a:r><a:t>Secret</a:t></a:r></a:p>", ' hidden="1"') +
        shape("<a:p><a:r><a:t>Layout band</a:t></a:r></a:p>"),
    );
    return zipSync(parts);
  };

  it("reads a pptx master's and layout's own shapes once, at the top, without placeholders, fields or hidden shapes", async () => {
    expect(slideMasterText(pptx())).toEqual(["Acme Corp", "Layout band"]);
    const { text } = await extractOfficeDocument(pptx());
    expect(text).toMatch(/^--- Slide master ---\nAcme Corp\nLayout band\n# Slide 1\nFirst slide/);
  });

  it("reads an ODP master page the slides use, and the footer text they show", () => {
    const frame = (body: string, attrs = "") => `<draw:frame${attrs}><draw:text-box>${body}</draw:text-box></draw:frame>`;
    const odp = odfDocument(
      "presentation",
      '<presentation:footer-decl presentation:name="ftr1">Draft v2</presentation:footer-decl>' +
        '<draw:page draw:name="p1" draw:master-page-name="Default" presentation:use-footer-name="ftr1">' +
        frame("<text:p>Slide text</text:p>") +
        "</draw:page>",
      '<style:master-page style:name="Default">' +
        frame("<text:p>Prompt</text:p>", ' presentation:class="title"') +
        frame("<text:p>Acme <text:page-number>1</text:page-number></text:p>") +
        `<presentation:notes>${frame("<text:p>Notes prompt</text:p>")}</presentation:notes>` +
        "</style:master-page>" +
        `<style:master-page style:name="Unused">${frame("<text:p>Unused decor</text:p>")}</style:master-page>`,
    );
    expect(slideMasterText(odp)).toEqual(["Acme", "Draft v2"]);
  });
});
