import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractCfb, extractWorkbook } from "~/lib/extract-cfb-client";
import { deckStreams, shape, text } from "../../../packages/core/tests/fixtures/ppt";
import { wordStreams } from "../../../packages/core/tests/fixtures/word";

/** A BIFF8 workbook, written by the same library that reads it. */
function biff8(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { bookType: "xls", type: "array" }));
}

/** A Word 97 document with one paragraph, in its container. */
function wordContainer(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  for (const [name, bytes] of wordStreams([{ text: "Minutes of the meeting.\r" }], { body: 24 })) {
    XLSX.CFB.utils.cfb_add(container, `/${name}`, bytes);
  }
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

/** Streams into a compound file, the way PowerPoint and Word store them. */
function compound(streams: Map<string, Uint8Array>): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  for (const [name, bytes] of streams) XLSX.CFB.utils.cfb_add(container, `/${name}`, bytes);
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};

/** An Outlook message: MAPI property streams in a compound file (MS-OXMSG). */
function outlookMessage(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(container, "/__properties_version1.0", new Uint8Array(32));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0037001F", utf16("Quarterly numbers"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_1000001F", utf16("Numbers are attached."));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0C1A001F", utf16("Alice Example"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_5D01001F", utf16("alice@example.com"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0E04001F", utf16("Bob"));
  XLSX.CFB.utils.cfb_add(container, "/__attach_version1.0_#00000000/__properties_version1.0", new Uint8Array(8));
  XLSX.CFB.utils.cfb_add(container, "/__attach_version1.0_#00000000/__substg1.0_3707001F", utf16("q3.pdf"));
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

describe("extractWorkbook comments", () => {
  it("writes a cell's comments after the sheet's rows, naming the cell, without Excel's author prefix", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Item", "Cost"], ["Rent", 900]]);
    sheet.B2.c = [{ a: "Cy", t: 'Cy:\nToo "high"' }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
    const bytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
    const { text, notes } = extractWorkbook(bytes);
    expect(text).toBe('# Sheet: Budget\nItem,Cost\nRent,900\n"[Comment, B2, Cy: Too ""high""]"');
    expect(notes).toEqual([{ kind: "comments-included", count: 1 }]);
  });
});

describe("extractWorkbook names", () => {
  it("writes an xls workbook's defined names and validation rules after the sheet they belong to", () => {
    // SheetJS writes no names into an .xls, so this is the coverage probe Excel's format came from.
    const probe = readFileSync(join(__dirname, "../../../packages/cli/scripts/coverage/probes/xls/gen-xls-coverage.xls"));
    const { text } = extractCfb(new Uint8Array(probe));
    expect(text).toContain("[Validation, C3: QZDVPTITLE: QZDVPROMPT; allowed: QZLISTA, QZLISTB; error: QZDVERRTITLE: QZDVERROR]");
    expect(text).toContain("[Name: QZDEFNAME = QZSHEETMAIN!$A$1]");
  });

  it("names an xls sheet's hidden row and column and leaves its very hidden sheet out", () => {
    const probe = readFileSync(join(__dirname, "../../../packages/cli/scripts/coverage/probes/xls/gen-xls-coverage.xls"));
    const { text, notes } = extractCfb(new Uint8Array(probe));
    expect(text).toContain("[Hidden: row 6, column J]");
    expect(text).toContain("QZHIDDENROW");
    expect(text).toContain("# Sheet: QZHIDDENSHEET (hidden)");
    expect(text).not.toContain("QZVHIDDEN");
    expect(notes).toContainEqual({ kind: "hidden-left-out", count: 1 });
  });

  it("writes an xlsx workbook's names once, from the package rather than SheetJS", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Rate"]]), "Inputs");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Total"]]), "Sums");
    workbook.Workbook = { Names: [{ Name: "Total", Ref: "Sums!$A$1" }] };
    const { text } = extractWorkbook(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
    expect(text).toContain("# Sheet: Sums\nTotal\n[Name: Total = Sums!$A$1]");
    expect(text.match(/\[Name: Total/g)).toHaveLength(1);
  });

  it("writes a BIFF name whose formula is a constant, which SheetJS hands back as a number or boolean", () => {
    const container = XLSX.CFB.read(biff8({ Inputs: [["Rate"]] }), { type: "array" });
    const entry = XLSX.CFB.find(container, "/Workbook")!;
    const stream = Uint8Array.from(entry.content as ArrayLike<number>);
    // Lbl records (2.4.150) holding ptgInt 5 and ptgBool true, before the globals' EOF.
    const lbl = (name: string, rgce: number[]) => {
      const body = [0, 0, 0, name.length, rgce.length, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...Array.from(name, (c) => c.charCodeAt(0)), ...rgce];
      return [0x18, 0, body.length, 0, ...body];
    };
    const added = [...lbl("Rate", [0x1e, 5, 0]), ...lbl("On", [0x1d, 1])];
    const view = new DataView(stream.buffer);
    let at = 0;
    for (; ; at += 4 + view.getUint16(at + 2, true)) {
      const type = view.getUint16(at, true);
      if (type === 0x0085) view.setUint32(at + 4, view.getUint32(at + 4, true) + added.length, true);
      if (type === 0x000a) break;
    }
    entry.content = Uint8Array.from([...stream.slice(0, at), ...added, ...stream.slice(at)]);
    entry.size = entry.content.length;
    const { text } = extractCfb(new Uint8Array(XLSX.CFB.write(container, { type: "array" })));
    expect(text).toContain("[Name: Rate = 5]");
    expect(text).toContain("[Name: On = TRUE]");
  });
});

describe("extractWorkbook links", () => {
  it("writes a cell's link after the sheet's rows, once a range, not an in-workbook one or one that is its text", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Docs", "Back", "https://x.example/"], ["Both", "", ""]]);
    sheet.A1.l = { Target: "https://x.example/docs", Tooltip: "Read me" };
    sheet.B1.l = { Target: "#Sheet2!A1" };
    sheet.C1.l = { Target: "https://x.example/" };
    const range = { Target: "mailto:team@x.example" };
    sheet.A2.l = range;
    sheet.B2.l = range;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Links");
    for (const bookType of ["xlsx", "xls"] as const) {
      const { text } = extractWorkbook(new Uint8Array(XLSX.write(workbook, { bookType, type: "array" })));
      const tip = bookType === "xlsx" ? "; Read me" : "";
      expect(text, bookType).toContain(`Both\n"[Link, A1: https://x.example/docs${tip}]"\n"[Link, A2: mailto:team@x.example]"`);
      expect(text, bookType).not.toMatch(/Link, (B1|C1|B2)/);
    }
  });
});

describe("extractCfb", () => {
  it("reads an Outlook message as the correspondence it is", () => {
    // Measured 2026-09-15 against ten real Outlook files as well (record in
    // docs/measurements); this fixture pins the container-to-streams seam.
    expect(extractCfb(outlookMessage())).toEqual({
      text: [
        "From: Alice Example <alice@example.com>",
        "To: Bob",
        "Subject: Quarterly numbers",
        "",
        "Numbers are attached.",
        "",
        "Attachments (1, not included): q3.pdf",
      ].join("\n"),
      notes: [{ kind: "attachments-skipped", count: 1 }],
    });
  });

  it("reads a 97-2003 workbook sheet by sheet, cells kept apart", () => {
    const { text, notes } = extractCfb(
      biff8({
        Revenue: [
          ["Region", "Q1", "Q2"],
          ["EMEA", 1200, 1350],
          ["APAC", 980, 1105],
        ],
        Headcount: [
          ["Team", "People"],
          ["Eng", 42],
        ],
      }),
    );
    // The same bar the office reader's workbook rendering is held to.
    expect(text).not.toMatch(/12001350/);
    expect(text).toMatch(/EMEA\D+1200\D+1350/);
    expect(text).toContain("# Sheet: Revenue");
    expect(text.indexOf("Revenue")).toBeLessThan(text.indexOf("Headcount"));
    expect(text.indexOf("APAC")).toBeLessThan(text.indexOf("Headcount"));
    expect(notes).toBeUndefined();
  });

  it("reads a Word 97-2003 document's text", () => {
    // Measured 2026-09-15 against fifteen real Word files (docs/measurements).
    expect(extractCfb(wordContainer())).toEqual({ text: "Minutes of the meeting." });
  });

  it("reads a PowerPoint 97-2003 deck slide by slide", () => {
    const deck = deckStreams({ slides: [{ shapes: [shape({ text: text("Quarterly review") })] }] });
    expect(extractCfb(compound(deck))).toEqual({ text: "# Slide 1\nQuarterly review" });
  });

  it("reads a compound file a server sent with a UTF-8 byte-order mark in front", () => {
    expect(extractCfb(Uint8Array.from([0xef, 0xbb, 0xbf, ...wordContainer()]))).toEqual({ text: "Minutes of the meeting." });
  });

  it("names a compound file whose sector tables do not hold together as damaged", () => {
    const bytes = wordContainer();
    expect(() => extractCfb(Uint8Array.from([...bytes.subarray(0, 512), 0, 0, 0, ...bytes.subarray(512)]))).toThrow(/damaged/);
  });

  it("answers a compound file nothing here reads with parser-unavailable, not a throw", () => {
    // A PowerPoint 95 deck shares the signature; the chain then tries anydoc,
    // and the ledger names it from there, under its own extension.
    const old = new Map([
      ["PowerPoint Document", new Uint8Array(64)],
      ["Current User", new Uint8Array(16)],
    ]);
    expect(extractCfb(compound(old))).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("finds a workbook stream however its writer capitalised it", () => {
    // Stream names compare case-insensitively (MS-CFB 2.6.4); two POI files
    // name it WORKBOOK and BOOK and came back empty with no error (P11).
    const container = XLSX.CFB.read(biff8({ Plan: [["Rate"], ["8%"]] }), { type: "array" });
    XLSX.CFB.utils.cfb_mov(container, "/Workbook", "/WORKBOOK");
    const upper = new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
    expect(extractCfb(upper).text).toBe("# Sheet: Plan\nRate\n8%");
  });

  it("reports a workbook with no cells as empty, never as its sheet headings", () => {
    expect(extractCfb(biff8({ Blank: [] })).text).toBe("");
  });
});

describe("extractWorkbook", () => {
  /** One sheet with a percentage and a date, as Excel would store them. */
  function formatted(bookType: "xlsx" | "xlsb"): Uint8Array {
    const sheet = XLSX.utils.aoa_to_sheet([["Rate", "Due"], [0.08, 45567]]);
    sheet.A2.z = "0%";
    sheet.B2.z = "yyyy-mm-dd";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Plan");
    return new Uint8Array(XLSX.write(workbook, { bookType, type: "array" }));
  }

  it("writes cells as Excel shows them, not as stored", () => {
    // officeparser wrote 0.08 and 45567 here; that gap is most of the 0.551 to
    // 0.753 agreement with Tika on POI workbooks (2026-10-05).
    expect(extractWorkbook(formatted("xlsx")).text).toBe("# Sheet: Plan\nRate,Due\n8%,2024-10-02");
  });

  it("reads a binary workbook, which officeparser cannot", () => {
    expect(extractWorkbook(formatted("xlsb")).text).toBe("# Sheet: Plan\nRate,Due\n8%,2024-10-02");
  });

  it("labels a hidden sheet and keeps its cells, and leaves a very hidden one out", () => {
    const workbook = XLSX.utils.book_new();
    for (const name of ["Shown", "Lookup", "Macro"]) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[name]]), name);
    workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }, { Hidden: 2 }] };
    for (const bookType of ["xlsx", "biff8"] as const) {
      const bytes = new Uint8Array(XLSX.write(workbook, { bookType, type: "array" }));
      expect(extractWorkbook(bytes)).toEqual({
        text: "# Sheet: Shown\nShown\n\n# Sheet: Lookup (hidden)\nLookup",
        notes: [{ kind: "hidden-left-out", count: 1 }],
      });
    }
  });

  it("drops the padding out to the sheet's range and keeps one blank line between tables", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Title"], ["Region", "Q1", "Q2"], ["EMEA", 1, 2], [], [], ["Notes"]]);
    sheet["!ref"] = "A1:F9";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sales");
    const bytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
    expect(extractWorkbook(bytes).text).toBe("# Sheet: Sales\nTitle\nRegion,Q1,Q2\nEMEA,1,2\n\nNotes");
  });

  /**
   * A workbook of one data sheet and one chartsheet. SheetJS writes no charts,
   * so the chartsheet, its drawing and the chart are added to the package by hand.
   */
  function withChartsheet(chartTitle: string | null): Uint8Array {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Month", "Revenue"], ["Jan", 10]]), "Data");
    const parts = unzipSync(new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
    const edit = (name: string, change: (xml: string) => string) => {
      parts[name] = strToU8(change(strFromU8(parts[name])));
    };
    const rel = (id: string, type: string, target: string) =>
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
    const rels = (...items: string[]) =>
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
    edit("xl/workbook.xml", (xml) => xml.replace("</sheets>", '<sheet name="Trend" sheetId="2" r:id="rIdChart"/></sheets>'));
    edit("xl/_rels/workbook.xml.rels", (xml) => xml.replace("</Relationships>", `${rel("rIdChart", "chartsheet", "chartsheets/sheet1.xml")}</Relationships>`));
    edit("[Content_Types].xml", (xml) =>
      xml.replace(
        "</Types>",
        '<Override PartName="/xl/chartsheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml"/>' +
          '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
          '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
      ),
    );
    parts["xl/chartsheets/sheet1.xml"] = strToU8(
      '<?xml version="1.0"?><chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><drawing r:id="rId1"/></chartsheet>',
    );
    parts["xl/chartsheets/_rels/sheet1.xml.rels"] = strToU8(rels(rel("rId1", "drawing", "../drawings/drawing1.xml")));
    parts["xl/drawings/drawing1.xml"] = strToU8(
      // SheetJS drops a chartsheet whose drawing anchors nothing, so this one
      // anchors the chart the way Excel writes it.
      '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="8670000" cy="6300000"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:absoluteAnchor></xdr:wsDr>',
    );
    parts["xl/drawings/_rels/drawing1.xml.rels"] = strToU8(rels(rel("rId1", "chart", "../charts/chart1.xml")));
    const title = chartTitle === null ? "" : `<c:title><c:tx><c:rich><a:p><a:r><a:t>${chartTitle}</a:t></a:r></a:p></c:rich></c:tx></c:title>`;
    parts["xl/charts/chart1.xml"] = strToU8(
      `<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart>${title}<c:plotArea><c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Axis</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx></c:plotArea></c:chart></c:chartSpace>`,
    );
    return zipSync(parts);
  }

  it("keeps a chartsheet under its name, with its chart's title and axis title", () => {
    expect(extractWorkbook(withChartsheet("Revenue &amp; cost")).text).toBe(
      "# Sheet: Data\nMonth,Revenue\nJan,10\n\n# Sheet: Trend (chart)\n[Chart: Revenue & cost; values: Axis]",
    );
  });

  it("never takes a chart's axis title for its title", () => {
    expect(extractWorkbook(withChartsheet(null)).text).toBe("# Sheet: Data\nMonth,Revenue\nJan,10\n\n# Sheet: Trend (chart)\n[Chart; values: Axis]");
  });
});
