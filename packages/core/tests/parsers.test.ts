import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createParserRegistry } from "../src/file-processing/parsers/registry";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { drawingChart, odfChart } from "../src/file-processing/parsers/office-charts";
import {
  deckPptx,
  furnitureDocx,
  minimalDocx,
  minimalEpub,
  referencesDocx,
  tableDocx,
  SHEET_MACRO_ENABLED,
  commentedDocx,
  commentedXlsx,
  chartedDocx,
  chartedPptx,
  chartedXlsx,
  chartedOdf,
  BAR_CHART,
  docxWithBody,
  odfDocument,
  spannedOds,
  twoSheetXlsx,
  twoSlidePptx,
} from "./fixtures/containers";

describe("createParserRegistry", () => {
  it("runs the loader a platform registered", async () => {
    const registry = createParserRegistry({
      office: async () => ({ text: "from the loader" }),
    });
    expect(registry.has("office")).toBe(true);
    expect(await registry.extract("office", new Uint8Array())).toEqual({
      text: "from the loader",
    });
  });

  it("answers an unregistered parser with a note, not an exception", async () => {
    // A build without a reader surfaces "couldn't extract text" — the documented
    // behaviour for a format it does not carry, not a crash and not a silent
    // reclassification (ADR-0011, ADR-0012).
    const registry = createParserRegistry({});
    expect(registry.has("epub")).toBe(false);
    expect(await registry.extract("epub", new Uint8Array([1, 2, 3]))).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("keeps platforms independent — one map's absence is not another's", async () => {
    const web = createParserRegistry({ office: async () => ({ text: "web" }) });
    const cli = createParserRegistry({});
    expect(web.has("office")).toBe(true);
    expect(cli.has("office")).toBe(false);
  });
});

describe("extractOfficeDocument", () => {
  it("extracts the text from a docx", async () => {
    const { text } = await extractOfficeDocument(minimalDocx("Hello extractable document"));
    expect(text).toContain("Hello extractable document");
  });

  it("returns empty text when the document carries none", async () => {
    const { text } = await extractOfficeDocument(minimalDocx(""));
    expect(text).toBe("");
  });

  it("extracts the prose from an rtf, not its markup", async () => {
    const rtf =
      `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\n` +
      `\\f0\\fs24 Hello from RTF. \\par\n` +
      `Second paragraph with \\b bold\\b0  text.\\par\n}`;
    const { text } = await extractOfficeDocument(strToU8(rtf));
    expect(text).toContain("Hello from RTF.");
    expect(text).toContain("bold");
    expect(text).not.toContain("\\rtf1");
    expect(text).not.toContain("fonttbl");
  });

  it("omits notes entirely when the document parsed cleanly", async () => {
    const result = await extractOfficeDocument(minimalDocx("clean"));
    expect(result.notes).toBeUndefined();
  });
});

/**
 * What reaches the bundle is what the model reads, so "we extracted something"
 * is not the bar — the structure has to survive. These are the two shapes that
 * behaved completely differently under the same renderer, which is why the
 * renderer is now chosen from the parsed tree.
 */
describe("extractOfficeDocument — structure survives extraction", () => {
  it("keeps a docx table's cells apart and its rows intact", async () => {
    const { text } = await extractOfficeDocument(tableDocx());

    expect(text).toContain("Quarterly Report");
    expect(text).toContain("Revenue by region, in thousands.");
    for (const row of [
      ["Region", "Q1", "Q2"],
      ["EMEA", "1200", "1350"],
      ["APAC", "980", "1105"],
    ]) {
      // One line per row, every cell on it, in column order.
      const line = text.split("\n").find((l) => l.includes(row[0]));
      expect(line, `no line carries ${row[0]}`).toBeDefined();
      let at = -1;
      for (const cell of row) {
        const next = line!.indexOf(cell, at + 1);
        expect(next, `${cell} missing or out of order in "${line}"`).toBeGreaterThan(at);
        at = next;
      }
    }
  });

  it("keeps a spreadsheet's cells apart", async () => {
    const { text } = await extractOfficeDocument(twoSheetXlsx());

    // The regression this exists for: the flat-text renderer wrote the row
    // `EMEA | 1200 | 1350` as `EMEA12001350`, where 1200 and 1350 can no longer
    // be told apart from each other or from a single number.
    expect(text).not.toMatch(/12001350/);
    expect(text).toMatch(/EMEA\D+1200\D+1350/);
    expect(text).toMatch(/APAC\D+980\D+1105/);
  });

  it("reads a table nested in a cell as that cell's text, keeping the outer columns", async () => {
    const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const tc = (body: string) => `<w:tc>${body}</w:tc>`;
    const inner = `<w:tbl><w:tr>${tc(p("In1"))}${tc(p("In2"))}</w:tr><w:tr>${tc(p("In3"))}${tc('<w:p><w:r><w:t xml:space="preserve">In </w:t></w:r><w:r><w:t>4</w:t></w:r></w:p>')}</w:tr></w:tbl>`;
    const { text } = await extractOfficeDocument(
      docxWithBody(
        `<w:tbl><w:tr>${tc(p("H1"))}${tc(p("H2"))}${tc(p("H3"))}</w:tr>` +
          `<w:tr>${tc(p("Outer") + inner + p(""))}${tc(p("Mid"))}${tc(p("Last"))}</w:tr></w:tbl>`,
      ),
    );
    const row = text.split("\n").find((line) => line.includes("Outer")) ?? "";
    expect(row.replace(/ +/g, " ")).toBe("| Outer In1 / In2; In3 / In 4 | Mid | Last |");
  });

  it("writes a review comment after the paragraph it is on, author named, and counts it", async () => {
    const { text, notes } = await extractOfficeDocument(commentedDocx());
    expect(text).toContain("Plain line.\n");
    expect(text).toContain("Reviewed line. [Comment, Ada Yilmaz: Check this figure.]");
    // On both runs of its range, written once.
    expect(text.match(/\[Comment/g)).toHaveLength(1);
    expect(notes).toContainEqual({ kind: "comments-included", count: 1 });
  });

  it("drops the author Excel puts before a note and splits a threaded comment's fallback text", async () => {
    const { text, notes } = await extractOfficeDocument(commentedXlsx(), { format: "xlsx" });
    expect(text).toContain("[Comment, A1, Ada: Check the region.]");
    expect(text).toContain("[Comment, B2: Is this final?]");
    expect(text).toContain("[Reply, B2: Yes.]");
    expect(text).not.toMatch(/tc=|Your version of Excel/);
    expect(notes).toContainEqual({ kind: "comments-included", count: 3 });
  });

  it("splits a long threaded fallback text in linear time", async () => {
    const xlsx = commentedXlsx(`[Threaded comment]${"\n ".repeat(150000)}x`);
    const start = performance.now();
    await extractOfficeDocument(xlsx, { format: "xlsx" });
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("writes an OpenDocument annotation inline and a sheet's cell comment as a row naming the cell", async () => {
    const note = (author: string, body: string) =>
      `<office:annotation><dc:creator>${author}</dc:creator><text:p>${body}</text:p></office:annotation>`;
    const odt = await extractOfficeDocument(odfDocument("text", `<text:p>Anchor${note("Bo", "Why?")} text.</text:p>`), { format: "odt" });
    expect(odt.text).toContain("Anchor text. [Comment, Bo: Why?]");
    const cell = (inner: string) => `<table:table-cell office:value-type="string">${inner}</table:table-cell>`;
    const ods = await extractOfficeDocument(
      odfDocument(
        "spreadsheet",
        '<table:table table:name="S">' +
          `<table:table-row>${cell("<text:p>A1</text:p>")}${cell("<text:p>B1</text:p>")}</table:table-row>` +
          `<table:table-row>${cell("<text:p>A2</text:p>")}${cell(note("Cy", "Too high") + "<text:p>B2</text:p>")}</table:table-row>` +
          "</table:table>",
      ),
      { format: "ods" },
    );
    expect(ods.text).toContain("A2,B2");
    expect(ods.text).toContain('"[Comment, B2, Cy: Too high]"');
    expect(ods.text.indexOf("[Comment")).toBeGreaterThan(ods.text.indexOf("A2,B2"));
  });

  it("keeps a cell after a merged range in its own column", async () => {
    const { text } = await extractOfficeDocument(spannedOds(), { format: "ods" });
    expect(text).toContain("QZMERGED,,QZAFTER");
    expect(text).toContain("A2,B2,C2");
  });

  it("keeps a merged workbook range one column wide per column, with or without the covered cell", async () => {
    for (const covered of ["", '<c r="B1" s="1"/>']) {
      const parts = unzipSync(twoSheetXlsx());
      parts["xl/worksheets/sheet1.xml"] = strToU8(
        strFromU8(parts["xl/worksheets/sheet1.xml"])
          .replace(/<c r="B1"[^]*?<\/c>/, covered)
          .replace("</sheetData>", '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>'),
      );
      const { text } = await extractOfficeDocument(zipSync(parts));
      expect(text).toContain("Region,,Q2");
      expect(text).toContain("EMEA,1200,1350");
    }
  });

  it("does not pad a crafted span out to its claimed width", async () => {
    const parts = unzipSync(spannedOds());
    parts["content.xml"] = strToU8(
      strFromU8(parts["content.xml"]).replace('number-columns-spanned="2"', 'number-columns-spanned="100000000"'),
    );
    const ods = zipSync(parts);
    const started = performance.now();
    const { text } = await extractOfficeDocument(ods, { format: "ods" });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(text).toContain("QZAFTER");
    const wide = docxWithBody(
      '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="100000000"/></w:tcPr><w:p><w:r><w:t>Wide</w:t></w:r></w:p></w:tc>' +
        "<w:tc><w:p><w:r><w:t>QZNEXT</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",
    );
    const again = performance.now();
    expect((await extractOfficeDocument(wide)).text).toContain("QZNEXT");
    expect(performance.now() - again).toBeLessThan(2000);
  });

  it("reads a macro-enabled workbook when told its base format", async () => {
    // The library sniffs the bytes as `xlsm`, which its reader table refuses;
    // the router's format is translated to the reader that opens the same
    // package. Without the hint this throws, and the file was "binary".
    const { text } = await extractOfficeDocument(twoSheetXlsx(SHEET_MACRO_ENABLED), {
      format: "xlsm",
    });
    expect(text).toMatch(/EMEA\D+1200\D+1350/);
    expect(text).toContain("Headcount");
  });

  it("reads the chapters of an epub through the office reader", async () => {
    const { text } = await extractOfficeDocument(minimalEpub("The quick brown chapter."), {
      format: "epub",
    });
    expect(text).toContain("Chapter 1");
    expect(text).toContain("The quick brown chapter.");
  });

  it("keeps a spreadsheet's sheets named and separate", async () => {
    const { text } = await extractOfficeDocument(twoSheetXlsx());

    // Without the names, two sheets arrive as one undivided block and nothing
    // says which numbers belong to which table.
    expect(text).toContain("Revenue");
    expect(text).toContain("Headcount");
    expect(text.indexOf("Revenue")).toBeLessThan(text.indexOf("Headcount"));
    expect(text.indexOf("APAC")).toBeLessThan(text.indexOf("Headcount"));
  });

  it("keeps a heading at the level the document gave it", async () => {
    const { text } = await extractOfficeDocument(tableDocx());

    // Flat, a heading is indistinguishable from body text and from a caption,
    // and nothing says which section a paragraph belongs to.
    expect(text).toContain("# Quarterly Report");
    expect(text).toContain("## Method Notes");
    // Prose is not a heading, whatever it sits between.
    expect(text).toContain("\nRevenue by region, in thousands.");
  });

  it("leaves a heading a parser only guessed at alone", async () => {
    // 16pt and bold, which is all the RTF reader needs to call something a
    // level-3 heading. It calls whole tables that, cell by cell, so a marker
    // here would be noise wearing the shape of structure.
    const rtf =
      `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\n` +
      `\\fs32\\b Looks Like A Heading\\b0\\fs24\\par\n` +
      `Ordinary prose underneath.\\par\n}`;
    const { text } = await extractOfficeDocument(strToU8(rtf));

    expect(text).toContain("Looks Like A Heading");
    expect(text).not.toContain("#");
  });

  it("gives a merged header cell the columns it covers", async () => {
    const { text } = await extractOfficeDocument(tableDocx());

    // A row one cell wide inside a three-column table is not a table any more:
    // aligned by position, the heading becomes a value in the first column and
    // the other two columns lose their data.
    const rows = text.split("\n").filter((line) => line.startsWith("|"));
    expect(rows[0]).toContain("Half-year totals");
    const widths = new Set(rows.map((line) => line.split("|").length));
    expect([...widths], `rows of differing width:\n${rows.join("\n")}`).toHaveLength(1);
  });

  it("keeps a page header and footer that sit outside the document body", async () => {
    const { text } = await extractOfficeDocument(furnitureDocx());

    // A confidentiality marking that reaches nobody is the worst shape this can
    // take: the document says it on every page and the extract says it nowhere.
    expect(text).toContain("--- Page header ---");
    expect(text).toContain("CONFIDENTIAL - Internal Distribution Only");
    expect(text).toContain("--- Page footer ---");
    expect(text).toContain("The body of the document");

    // Once, not once per header part. Word writes one per section and per
    // first/even variant, and repeating furniture is the thing being fixed.
    const lines = text.split("\n").map((line) => line.trim());
    expect(lines.filter((l) => l === "CONFIDENTIAL - Internal Distribution Only")).toHaveLength(1);
    // The marking belongs ahead of what it governs.
    expect(text.indexOf("CONFIDENTIAL")).toBeLessThan(text.indexOf("The body of the document"));
  });

  it("keeps every header and footer an ODT prints, once each", async () => {
    const master = (name: string, regions: string) => `<style:master-page style:name="${name}">${regions}</style:master-page>`;
    const region = (tag: string, text: string, off = false) =>
      `<style:${tag}${off ? ' style:display="false"' : ""}><text:p>${text}</text:p></style:${tag}>`;
    const odt = odfDocument(
      "text",
      "<text:p>Body</text:p>",
      master("Standard", region("header", "Main head") + region("header-first", "Cover head") + region("footer", "Main  foot") + region("footer-left", "Even foot")) +
        master("Unused", region("header", "Template junk")) +
        master("Off", region("header", "Switched off", true)),
    );
    // officeparser's own reading of the default pair comes first; the same line
    // read again here differs only in whitespace and is dropped as a repeat.
    expect((await extractOfficeDocument(odt)).text).toBe(
      "--- Page header ---\nMain head\nCover head\nBody\n--- Page footer ---\nMain  foot\nEven foot",
    );
  });

  it("marks where each slide of a deck begins", async () => {
    const { text } = await extractOfficeDocument(twoSlidePptx());

    // Without a marker the last line of slide one and the title of slide two
    // are consecutive lines of prose, and a deck reads as one long list.
    expect(text).toContain("# Slide 1");
    expect(text).toContain("# Slide 2");
    expect(text.indexOf("# Slide 1")).toBeLessThan(text.indexOf("Roadmap"));
    expect(text.indexOf("Measure quality")).toBeLessThan(text.indexOf("# Slide 2"));
    expect(text.indexOf("# Slide 2")).toBeLessThan(text.indexOf("Risks"));
  });

  it("drops the slide number a deck's speaker notes carry", async () => {
    const { text } = await extractOfficeDocument(twoSlidePptx());

    // The notes master's slide-number placeholder puts a bare `1` in slide
    // one's notes, and the renderer writes it under the slide body — where,
    // beneath a slide of figures, it reads as one more figure. `# Slide 1`
    // above the slide already says which slide this is.
    expect(text).toContain("Open with the counters");
    const lines = text.split("\n").map((line) => line.trim());
    expect(lines).not.toContain("1");
  });

  it("labels a slide's speaker notes so they do not read as slide text", async () => {
    const { text } = await extractOfficeDocument(twoSlidePptx());

    expect(text.indexOf("Measure quality")).toBeLessThan(text.indexOf("--- Speaker notes ---"));
    expect(text.indexOf("--- Speaker notes ---")).toBeLessThan(text.indexOf("Open with the counters"));
    expect(text.match(/--- Speaker notes ---/g)).toHaveLength(1);
  });

  it("drops the slide number on a slide and keeps one copy of its footer and date", async () => {
    const chrome = (n: number) => [
      { ph: "ftr", lines: ["Acme Confidential"] },
      { ph: "dt", lines: ["14 October 2026"] },
      { ph: "sldNum", lines: [String(n)] },
    ];
    const { text } = await extractOfficeDocument(
      deckPptx([1, 2, 3].map((n) => ({ shapes: [{ lines: [`Point ${"ABC"[n - 1]}`] }, ...chrome(n)] }))),
    );
    const lines = text.split("\n").map((line) => line.trim());

    for (const n of ["1", "2", "3"]) expect(lines).not.toContain(n);
    expect(lines.filter((line) => line === "Acme Confidential")).toHaveLength(1);
    expect(lines.filter((line) => line === "14 October 2026")).toHaveLength(1);
    for (const point of ["Point A", "Point B", "Point C"]) expect(text).toContain(point);
  });

  it("reads a footer holding an entity no character has", async () => {
    const { text } = await extractOfficeDocument(
      deckPptx([1, 2, 3].map(() => ({ shapes: [{ lines: ["Body"] }, { ph: "ftr", lines: ["A &#99999999; B"] }] }))),
    );
    expect(text).toContain("Body");
  });

  it("says which slides are hidden rather than dropping them", async () => {
    const { text } = await extractOfficeDocument(
      deckPptx([{ shapes: [{ lines: ["Shown"] }] }, { shapes: [{ lines: ["Parked"] }], hidden: true }]),
    );

    expect(text).toContain("# Slide 1\n");
    expect(text).toMatch(/# Slide 2 \(hidden\)\s+Parked/);
  });

  it("reads a slide's chrome and hidden state by its place in the deck, not its file name", async () => {
    // Moved in PowerPoint: slide2.xml now opens the deck. officeparser numbers
    // slides by deck position, so the chrome has to be keyed the same way.
    const parts = unzipSync(
      deckPptx([
        { shapes: [{ lines: ["Second"] }, { ph: "sldNum", lines: ["2"] }], hidden: true },
        { shapes: [{ lines: ["First"] }, { ph: "sldNum", lines: ["1"] }] },
      ]),
    );
    const presentation = strFromU8(parts["ppt/presentation.xml"]);
    parts["ppt/presentation.xml"] = strToU8(
      presentation.replace(/(<p:sldId [^>]*r:id="rId1"\/>)(<p:sldId [^>]*r:id="rId2"\/>)/, "$2$1"),
    );
    const { text } = await extractOfficeDocument(zipSync(parts));
    const lines = text.split("\n").map((line) => line.trim());

    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
    expect(lines).not.toContain("1");
    expect(lines).not.toContain("2");
    expect(text).toMatch(/# Slide 2 \(hidden\)\s+Second/);
  });

  it("leaves a document that has no slides unmarked", async () => {
    const { text } = await extractOfficeDocument(tableDocx());
    expect(text).not.toContain("# Slide");
  });
});

/**
 * A link's destination and a footnote's marker are both carried outside the
 * visible characters of a document, so losing them costs a reader nothing it
 * can see. That is what makes them worth a test: the output stays fluent and
 * plausible either way, and only an assertion tells the two apart.
 */
describe("extractOfficeDocument — references survive extraction", () => {
  it("writes a link's destination beside its anchor text", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    expect(text).toContain("[our documentation](https://fileconcat.com/docs/introduction)");
  });

  it("does not repeat a destination that is already the visible text", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    const feed = "https://example.org/feed.json";
    expect(text).toContain(feed);
    expect(text.split(feed).length - 1, `"${feed}" written more than once`).toBe(1);
  });

  it("marks each footnote reference and labels the matching body", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    // Both claims sit in one sentence, so without the markers nothing says
    // which of the two collected notes belongs to which claim.
    expect(text).toContain("Revenue rose 12 percent[^1]");
    expect(text).toContain("against a flat market[^2]");
    expect(text).toContain("[^1] Measured on 2026-08-15.");
    expect(text).toContain("[^2] Second note, on the same page.");
  });

  it("leaves a deck's speaker notes unnumbered", async () => {
    // Speaker notes are not references: they are rendered under their own
    // slide, so a marker beside one would point at nothing.
    const { text } = await extractOfficeDocument(twoSlidePptx());
    expect(text).not.toContain("[^");
  });
});

describe("charts", () => {
  const table = [
    "| Quarter | North     | South | ",
    "| Q1      | 10        | 30    | ",
    "| Q2      | 20 (peak) | 40    | ",
  ].join("\n");

  it("writes a deck's chart where it sits, as its label and a table of its data", async () => {
    expect((await extractOfficeDocument(chartedPptx())).text).toBe(`# Slide 1\nResults\n[Chart, bar: Sales R&D; values: USD]\n\n${table.trimEnd()}`);
  });

  it("writes a docx chart after its paragraph, with its alt text", async () => {
    expect((await extractOfficeDocument(chartedDocx())).text).toBe(`Before\n[Chart, bar: Sales R&D; Bars by quarter; values: USD]\n\n${table}\n\nAfter`);
  });

  it("writes a chart part once however many relationships name it", async () => {
    const parts = unzipSync(chartedDocx());
    const doc = strFromU8(parts["word/document.xml"]);
    const held = /<w:p><w:r><w:drawing>.*?<\/w:p>/.exec(doc)?.[0] ?? "";
    expect(held).toContain('r:id="rIdC"');
    parts["word/document.xml"] = strToU8(doc.replace(held, held + held.replace('r:id="rIdC"', 'r:id="rIdD"')));
    const rels = strFromU8(parts["word/_rels/document.xml.rels"]);
    parts["word/_rels/document.xml.rels"] = strToU8(rels.replace("</Relationships>", rels.replace(/^[\s\S]*?(<Relationship )/, "$1").replace('Id="rIdC"', 'Id="rIdD"')));
    expect((await extractOfficeDocument(zipSync(parts))).text.split("[Chart").length).toBe(2);
  });

  it("names each sheet by its own part, labels a hidden one, and writes what is drawn on it", async () => {
    expect((await extractOfficeDocument(chartedXlsx())).text).toBe(
      "# Sheet: Revenue\nRegion,Q1,Q2\nEMEA,1200,1350\nAPAC,980,1105\n[Text box: Read me first],,\n" +
        '"[Chart, bar: Sales R&D; values: USD]",,\nQuarter,North,South\nQ1,10,30\nQ2,20 (peak),40\n\n' +
        "# Sheet: Headcount (hidden)\nTeam,People,\nEng,42,\n\n" +
        '# Sheet: Trend (chart)\n"[Chart, line: Trend]",,',
    );
  });

  it("writes an OpenDocument chart in its paragraph, and a sheet's after the sheet's rows", async () => {
    const frame = (alt = "") =>
      `<draw:frame xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0">` +
      `<draw:object xlink:href="./Object 1"/>${alt ? `<svg:desc>${alt}</svg:desc>` : ""}</draw:frame>`;
    const grid = "| Month | Site | \n| Jan   | 99.5 | ";
    expect((await extractOfficeDocument(chartedOdf("text", `<text:p>Before</text:p><text:p>${frame("Monthly")}</text:p><text:p>After</text:p>`))).text).toBe(
      `Before\n[Chart, bar: Uptime; Monthly]\n\n${grid}\n\nAfter`,
    );
    const sheet = `<table:table table:name="S"><table:table-row><table:table-cell><text:p>A1</text:p>${frame()}</table:table-cell></table:table-row></table:table>`;
    expect((await extractOfficeDocument(chartedOdf("spreadsheet", sheet))).text).toBe('A1,\n"[Chart, bar: Uptime]",\nMonth,Site\nJan,99.5');
  });

  it("reads a scatter chart along its first axis and skips what is no data", () => {
    const xml = BAR_CHART.replace(/barChart/g, "scatterChart").replace(/<c:cat>/g, "<c:xVal>").replace(/<\/c:cat>/g, "</c:xVal>").replace(/catAx/g, "valAx");
    expect(drawingChart(xml)).toEqual({
      label: "[Chart, scatter: Sales R&D; values: USD]",
      rows: [["Quarter", "North", "South"], ["Q1", "10", "30"], ["Q2", "20 (peak)", "40"]],
    });
    expect(drawingChart("<c:chartSpace><c:chart><c:plotArea><c:lineChart/></c:plotArea></c:chart></c:chartSpace>")).toEqual({ label: "[Chart, line]", rows: [] });
    expect(drawingChart("<w:document/>")).toBeUndefined();
  });

  it("reads an OpenDocument chart's own table, titles and axis titles", () => {
    const cell = (text: string, repeat = "") => `<table:table-cell${repeat}><text:p>${text}</text:p></table:table-cell>`;
    const xml =
      `<office:chart><chart:chart chart:class="chart:line"><chart:title><text:p>Load<text:s/>&amp; time</text:p></chart:title>` +
      `<chart:plot-area><chart:axis chart:dimension="x"><chart:title><text:p>Hour</text:p></chart:title></chart:axis>` +
      `<chart:axis chart:dimension="y"><chart:title><text:p>Users</text:p></chart:title></chart:axis></chart:plot-area>` +
      `<table:table><table:table-header-rows><table:table-row><table:table-cell/>${cell("Web")}${cell("App")}</table:table-row></table:table-header-rows>` +
      `<table:table-rows><table:table-row>${cell("9")}<table:table-cell table:number-columns-repeated="1000"/></table:table-row>` +
      `<table:table-row>${cell("10")}${cell("5")}${cell("7")}</table:table-row></table:table-rows></table:table></chart:chart></office:chart>`;
    expect(odfChart(`<chart:chart>${xml}`, "Alt")).toEqual({
      label: "[Chart, line: Load & time; Alt; values: Users]",
      rows: [["Hour", "Web", "App"], ["9"], ["10", "5", "7"]],
    });
  });

  it("caps a chart whose series number their points apart, and reads a crafted part in linear time", () => {
    const series = (from: number) =>
      `<c:ser><c:val><c:numCache>${Array.from({ length: 2000 }, (_, i) => `<c:pt idx="${from + i}"><c:v>1</c:v></c:pt>`).join("")}</c:numCache></c:val></c:ser>`;
    const wide = `<c:chartSpace><c:chart><c:plotArea><c:barChart>${Array.from({ length: 200 }, (_, i) => series(i * 2000)).join("")}</c:barChart></c:plotArea></c:chart></c:chartSpace>`;
    const started = performance.now();
    const rows = drawingChart(wide)!.rows;
    expect(rows.length * rows[0].length).toBeLessThan(110_000);
    expect(rows[rows.length - 1]).toEqual([`(${400_000 - rows.length + 2} more points left out)`]);
    expect(drawingChart(`<c:chartSpace>${"<a>".repeat(200_000)}${"<c:v>x</c:v><".repeat(100_000)}`)).toBeDefined();
    expect(odfChart(`<chart:chart>${"<table:table-row>".repeat(50_000)}${'<table:table-cell table:number-columns-repeated="99999"/>'.repeat(50_000)}`)!.rows.length).toBe(0);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
