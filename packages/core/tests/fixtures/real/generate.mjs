/**
 * Generate the extraction-quality measurement corpus.
 *
 *   npm i docx exceljs pptxgenjs pdfkit    # in a scratch dir, then symlink or
 *                                          # run with that dir's node_modules
 *   node generate.mjs
 *
 * These libraries are deliberately NOT workspace dependencies: nothing that
 * ships needs them, and four unused devDependencies would ride in every
 * install forever for a corpus that is regenerated on demand.
 *
 * The corpus is a flat list of entries. Each names the structures it exercises
 * and builds its own bytes, so supporting a new structure means adding one
 * entry (or one line to an existing entry's `structures`), re-running, and the
 * probe picks it up from `manifest.json` without being touched. A builder that
 * throws is reported and skipped rather than taking the run down with it, so a
 * library that cannot express something never costs us the rest of the corpus.
 *
 * Everything here is generated. Real documents behave differently in ways a
 * generator cannot anticipate, so any report built on this corpus has to say
 * so — that is what the `gen-` filename prefix is for.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  AlignmentType,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalMergeType,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { strToU8, zipSync } from "fflate";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";

const OUT = import.meta.dirname;

/** FreeSerif carries real OpenType `liga`, which the PDF base-14 fonts cannot express. */
const SERIF_TTF = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf";

/* ------------------------------------------------------------------ helpers */

/** Collect a pdfkit document into a Buffer. */
function renderPdf(build, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, ...options });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Render text into a PNG with PIL. A scanned page is the one fixture that
 * cannot be written as instructions — it has to be actual pixels of actual
 * glyphs, or it tests the absence of a text layer without testing whether
 * recognition can read anything back.
 */
function renderScanPng(lines) {
  const script = `
import sys, io
from PIL import Image, ImageDraw, ImageFont
lines = sys.argv[1].split("|")
img = Image.new("L", (1240, 500), 255)
draw = ImageDraw.Draw(img)
font = ImageFont.truetype("${SERIF_TTF}", 34)
y = 40
for line in lines:
    draw.text((60, y), line, font=font, fill=25)
    y += 58
buf = io.BytesIO()
img.save(buf, "PNG")
sys.stdout.buffer.write(buf.getvalue())
`;
  return execFileSync("python3", ["-c", script, lines.join("|")], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Assemble an OpenDocument package. `mimetype` must be first and stored. */
function odf(mimetype, content) {
  return Buffer.from(
    zipSync(
      {
        mimetype: strToU8(mimetype),
        "META-INF/manifest.xml": strToU8(
          `<?xml version="1.0" encoding="UTF-8"?>` +
            `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">` +
            `<manifest:file-entry manifest:full-path="/" manifest:media-type="${mimetype}"/>` +
            `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
            `</manifest:manifest>`,
        ),
        "content.xml": strToU8(content),
      },
      { level: 0 },
    ),
  );
}

const ODF_NS =
  `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
  `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
  `xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ` +
  `xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"`;

/* ------------------------------------------------------------------- corpus */

const CORPUS = [
  /* ============================== docx — 17 runs / 17 visits / 7 days ====== */
  {
    file: "gen-docx-structure.docx",
    structures: [
      "heading levels H1/H2/H3",
      "body prose in reading order",
      "bold and italic inline emphasis",
      "explicit page break",
      "centred paragraph",
    ],
    async build() {
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: "Annual Review", heading: HeadingLevel.HEADING_1 }),
              new Paragraph("Opening prose that belongs under the top-level heading."),
              new Paragraph({ text: "Regional Performance", heading: HeadingLevel.HEADING_2 }),
              new Paragraph("Prose under the second-level heading."),
              new Paragraph({ text: "EMEA Detail", heading: HeadingLevel.HEADING_3 }),
              new Paragraph({
                children: [
                  new TextRun("Growth was "),
                  new TextRun({ text: "strong", bold: true }),
                  new TextRun(" but margins were "),
                  new TextRun({ text: "thin", italics: true }),
                  new TextRun("."),
                ],
              }),
              new Paragraph({ text: "Centred caption line", alignment: AlignmentType.CENTER }),
              new Paragraph({ children: [new PageBreak()] }),
              new Paragraph({ text: "Appendix", heading: HeadingLevel.HEADING_1 }),
              new Paragraph("First line on page two, after an explicit page break."),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-lists.docx",
    structures: [
      "bulleted list, two nesting levels",
      "numbered list, two nesting levels",
      "list immediately following prose",
    ],
    async build() {
      const doc = new Document({
        numbering: {
          config: [
            {
              reference: "steps",
              levels: [
                { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START },
                { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.START },
              ],
            },
          ],
        },
        sections: [
          {
            children: [
              new Paragraph("Requirements, as an unordered list:"),
              new Paragraph({ text: "Read the bytes", bullet: { level: 0 } }),
              new Paragraph({ text: "Never read the filename", bullet: { level: 1 } }),
              new Paragraph({ text: "Route to a parser", bullet: { level: 1 } }),
              new Paragraph({ text: "Render the tree", bullet: { level: 0 } }),
              new Paragraph("Procedure, as an ordered list:"),
              new Paragraph({ text: "Open the document", numbering: { reference: "steps", level: 0 } }),
              new Paragraph({ text: "Check the top level", numbering: { reference: "steps", level: 1 } }),
              new Paragraph({ text: "Pick a renderer", numbering: { reference: "steps", level: 1 } }),
              new Paragraph({ text: "Write the output", numbering: { reference: "steps", level: 0 } }),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-tables.docx",
    structures: [
      "plain table with a header row",
      "horizontally merged cell (columnSpan)",
      "vertically merged cell (rowSpan)",
      "empty cell in the middle of a row",
      "cell containing two paragraphs",
      "prose before and after each table",
    ],
    async build() {
      const cell = (text, opts = {}) =>
        new TableCell({
          children: [new Paragraph(text)],
          width: { size: 2000, type: WidthType.DXA },
          ...opts,
        });
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph("Prose before the plain table."),
              new Table({
                rows: [
                  new TableRow({ children: [cell("Region"), cell("Q1"), cell("Q2")] }),
                  new TableRow({ children: [cell("EMEA"), cell("1200"), cell("1350")] }),
                  // The empty middle cell is the alignment test: a reader that
                  // drops it silently shifts every later column left by one.
                  new TableRow({ children: [cell("APAC"), cell(""), cell("1105")] }),
                ],
              }),
              new Paragraph("Prose between the two tables."),
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      cell("Half-year totals", { columnSpan: 3 }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      cell("Segment", { rowSpan: 2 }),
                      cell("Revenue"),
                      cell("Cost"),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [],
                        verticalMerge: VerticalMergeType.CONTINUE,
                        width: { size: 2000, type: WidthType.DXA },
                      }),
                      cell("2550"),
                      cell("1900"),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph("Notes"), new Paragraph("Second paragraph in one cell")],
                        width: { size: 2000, type: WidthType.DXA },
                      }),
                      cell("n/a"),
                      cell("n/a"),
                    ],
                  }),
                ],
              }),
              new Paragraph("Prose after the merged table."),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-references.docx",
    structures: [
      "footnote with body text",
      "hyperlink whose visible text differs from its URL",
      "bare URL as visible text",
    ],
    async build() {
      const doc = new Document({
        footnotes: {
          1: { children: [new Paragraph("Footnote body: measured on 2026-08-15.")] },
          2: { children: [new Paragraph("Second footnote body, on the same page.")] },
        },
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun("Revenue rose 12 percent"),
                  new FootnoteReferenceRun(1),
                  new TextRun(" against a flat market"),
                  new FootnoteReferenceRun(2),
                  new TextRun("."),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun("Full methodology at "),
                  new ExternalHyperlink({
                    children: [new TextRun({ text: "our documentation", style: "Hyperlink" })],
                    link: "https://fileconcat.com/docs/introduction",
                  }),
                  new TextRun(" and the raw feed at "),
                  new ExternalHyperlink({
                    children: [new TextRun({ text: "https://example.org/feed.json", style: "Hyperlink" })],
                    link: "https://example.org/feed.json",
                  }),
                  new TextRun("."),
                ],
              }),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-furniture.docx",
    structures: [
      "running header repeated on every page",
      "running footer with a page number field",
      "three pages of body prose",
    ],
    async build() {
      const doc = new Document({
        sections: [
          {
            headers: {
              default: new Header({
                children: [new Paragraph("CONFIDENTIAL — Internal Distribution Only")],
              }),
            },
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })],
                  }),
                ],
              }),
            },
            children: [
              new Paragraph("Body paragraph on page one."),
              new Paragraph({ children: [new PageBreak()] }),
              new Paragraph("Body paragraph on page two."),
              new Paragraph({ children: [new PageBreak()] }),
              new Paragraph("Body paragraph on page three."),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-revisions.docx",
    structures: [
      "tracked insertion",
      "tracked deletion (text struck out but still in the file)",
      "comment anchored to a range",
    ],
    async build() {
      const doc = new Document({
        comments: {
          children: [
            {
              id: 0,
              author: "Reviewer",
              date: new Date("2026-08-01T00:00:00Z"),
              children: [new Paragraph("Comment body: is this figure still current?")],
            },
          ],
        },
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun("The forecast is "),
                  new DeletedTextRun({
                    text: "DELETED-SENTENCE-DO-NOT-SHIP",
                    id: 1,
                    author: "Reviewer",
                    date: "2026-08-01T00:00:00Z",
                  }),
                  new InsertedTextRun({
                    text: "INSERTED-REPLACEMENT-TEXT",
                    id: 2,
                    author: "Reviewer",
                    date: "2026-08-01T00:00:00Z",
                  }),
                  new TextRun(" for the coming year."),
                ],
              }),
              new Paragraph({
                children: [
                  new CommentRangeStart(0),
                  new TextRun("Margin held at 31 percent."),
                  new CommentRangeEnd(0),
                  new TextRun({ children: [new CommentReference(0)] }),
                ],
              }),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  {
    file: "gen-docx-image.docx",
    structures: ["inline raster image with a caption paragraph", "prose either side of the image"],
    async build() {
      const png = renderScanPng(["Text that lives only inside the image"]);
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph("Prose before the figure."),
              new Paragraph({
                children: [
                  new ImageRun({ type: "png", data: png, transformation: { width: 400, height: 160 } }),
                ],
              }),
              new Paragraph("Figure 1: the caption that belongs to the image above."),
              new Paragraph("Prose after the figure."),
            ],
          },
        ],
      });
      return Packer.toBuffer(doc);
    },
  },

  /* ============================== xlsx / ods — 1 run each, floor check ===== */
  {
    file: "gen-xlsx-sheets.xlsx",
    structures: [
      "three named sheets",
      "formula cell with a cached result",
      "date cell with a display format",
      "currency and percentage number formats",
      "boolean cell",
      "empty cell in the middle of a row",
      "horizontally merged header cell",
    ],
    async build() {
      const wb = new ExcelJS.Workbook();

      const values = wb.addWorksheet("Revenue");
      values.mergeCells("A1:C1");
      values.getCell("A1").value = "FY2026 Revenue";
      values.addRow(["Region", "Q1", "Q2"]);
      values.addRow(["EMEA", 1200, 1350]);
      values.addRow(["APAC", null, 1105]);

      const derived = wb.addWorksheet("Derived");
      derived.addRow(["Metric", "Value"]);
      derived.getCell("A2").value = "Total";
      derived.getCell("B2").value = { formula: "SUM(Revenue!B3:C4)", result: 3655 };
      derived.getCell("A3").value = "Margin";
      derived.getCell("B3").value = 0.314;
      derived.getCell("B3").numFmt = "0.0%";
      derived.getCell("A4").value = "Booked";
      derived.getCell("B4").value = 1200.5;
      derived.getCell("B4").numFmt = '"$"#,##0.00';
      derived.getCell("A5").value = "Approved";
      derived.getCell("B5").value = true;

      const dates = wb.addWorksheet("Schedule");
      dates.addRow(["Milestone", "Due"]);
      dates.getCell("A2").value = "Kickoff";
      dates.getCell("B2").value = new Date(Date.UTC(2026, 0, 15));
      dates.getCell("B2").numFmt = "yyyy-mm-dd";
      dates.getCell("A3").value = "Review";
      dates.getCell("B3").value = new Date(Date.UTC(2026, 5, 30));
      dates.getCell("B3").numFmt = "d mmmm yyyy";

      return Buffer.from(await wb.xlsx.writeBuffer());
    },
  },

  {
    file: "gen-xlsx-csv-hazards.xlsx",
    structures: [
      "cell value containing a comma",
      "cell value containing a double quote",
      "cell value containing a newline",
      "leading-zero string that looks numeric",
      "number wide enough to lose precision",
      "cell value that is itself a csv row",
    ],
    async build() {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Hazards");
      sheet.addRow(["Label", "Value", "After"]);
      sheet.addRow(["comma", "Smith, John", "next"]);
      sheet.addRow(["quote", 'He said "no"', "next"]);
      sheet.addRow(["newline", "line one\nline two", "next"]);
      sheet.addRow(["leading zero", "007", "next"]);
      // Written through Number() rather than as a literal: the value is meant
      // to exceed float precision, and a bare literal that large is a lint error.
      sheet.addRow(["big number", Number("12345678901234567890"), "next"]);
      sheet.addRow(["csv-shaped", "a,b,c", "next"]);
      return Buffer.from(await wb.xlsx.writeBuffer());
    },
  },

  {
    file: "gen-ods-sheets.ods",
    structures: ["two named sheets", "numeric and text cells"],
    async build() {
      const cell = (v, numeric) =>
        numeric
          ? `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>`
          : `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`;
      const row = (cells) =>
        `<table:table-row>${cells.map(([v, n]) => cell(v, n)).join("")}</table:table-row>`;
      const sheet = (name, rows) =>
        `<table:table table:name="${name}">${rows.map(row).join("")}</table:table>`;
      return odf(
        "application/vnd.oasis.opendocument.spreadsheet",
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<office:document-content ${ODF_NS} office:version="1.2"><office:body><office:spreadsheet>` +
          sheet("Revenue", [
            [["Region", false], ["Q1", false]],
            [["EMEA", false], [1200, true]],
          ]) +
          sheet("Headcount", [
            [["Team", false], ["People", false]],
            [["Eng", false], [42, true]],
          ]) +
          `</office:spreadsheet></office:body></office:document-content>`,
      );
    },
  },

  /* ============================== pptx / odp ============================== */
  {
    file: "gen-pptx-deck.pptx",
    structures: [
      "title slide",
      "bullet slide with two nesting levels",
      "slide carrying a table",
      "speaker notes",
      "slide with no text at all",
      "slide whose own body text reads like a slide marker",
    ],
    async build() {
      const pptx = new PptxGenJS();

      const title = pptx.addSlide();
      title.addText("Extraction Quality", { x: 1, y: 1.5, fontSize: 36, bold: true });
      title.addText("A measurement, not a fix", { x: 1, y: 2.4, fontSize: 18 });
      title.addNotes("Speaker note for the title slide: open with the counters.");

      const bullets = pptx.addSlide();
      bullets.addText("Findings", { x: 0.5, y: 0.4, fontSize: 28, bold: true });
      bullets.addText(
        [
          { text: "Tables", options: { bullet: true, indentLevel: 0 } },
          { text: "Cells run together", options: { bullet: true, indentLevel: 1 } },
          { text: "Sheets", options: { bullet: true, indentLevel: 0 } },
          { text: "Names survive", options: { bullet: true, indentLevel: 1 } },
        ],
        { x: 0.7, y: 1.3, fontSize: 18 },
      );

      const table = pptx.addSlide();
      table.addText("Numbers", { x: 0.5, y: 0.4, fontSize: 28, bold: true });
      table.addTable(
        [
          [{ text: "Format" }, { text: "Runs" }],
          [{ text: "pdf" }, { text: "31" }],
          [{ text: "ipynb" }, { text: "18" }],
        ],
        { x: 0.7, y: 1.3, w: 5 },
      );

      // Nothing but a shape: proves whether an empty slide still gets a boundary.
      const blank = pptx.addSlide();
      blank.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 3, h: 2, fill: { color: "888888" } });

      // The deck's own text imitating the marker we inject. If the marker were
      // patched into the rendered string rather than the tree, this line would
      // be indistinguishable from a real boundary.
      const impostor = pptx.addSlide();
      impostor.addText("# Slide 99", { x: 1, y: 1, fontSize: 24 });
      impostor.addText("Body text under a line that looks like a marker", { x: 1, y: 2, fontSize: 16 });

      return Buffer.from(await pptx.write({ outputType: "nodebuffer" }));
    },
  },

  {
    file: "gen-odp-deck.odp",
    structures: ["two slides with title and body text"],
    async build() {
      const frame = (text) =>
        `<draw:frame><draw:text-box><text:p>${text}</text:p></draw:text-box></draw:frame>`;
      const page = (name, lines) =>
        `<draw:page draw:name="${name}">${lines.map(frame).join("")}</draw:page>`;
      return odf(
        "application/vnd.oasis.opendocument.presentation",
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<office:document-content ${ODF_NS} office:version="1.2"><office:body><office:presentation>` +
          page("page1", ["Roadmap", "Ship the parser"]) +
          page("page2", ["Risks", "Tables collapse"]) +
          `</office:presentation></office:body></office:document-content>`,
      );
    },
  },

  {
    file: "gen-odt-document.odt",
    structures: ["headings", "prose", "a table", "a list"],
    async build() {
      const cell = (t) => `<table:table-cell><text:p>${t}</text:p></table:table-cell>`;
      return odf(
        "application/vnd.oasis.opendocument.text",
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<office:document-content ${ODF_NS} office:version="1.2"><office:body><office:text>` +
          `<text:h text:outline-level="1">Quarterly Report</text:h>` +
          `<text:p>Revenue by region, in thousands.</text:p>` +
          `<text:list><text:list-item><text:p>First item</text:p></text:list-item>` +
          `<text:list-item><text:p>Second item</text:p></text:list-item></text:list>` +
          `<table:table table:name="Revenue">` +
          `<table:table-row>${cell("Region")}${cell("Q1")}</table:table-row>` +
          `<table:table-row>${cell("EMEA")}${cell("1200")}</table:table-row>` +
          `</table:table>` +
          `<text:p>Closing prose after the table.</text:p>` +
          `</office:text></office:body></office:document-content>`,
      );
    },
  },

  /* ============================== pdf — 31 runs / 27 visits / 10 days ===== */
  {
    file: "gen-pdf-prose.pdf",
    structures: [
      "three pages of single-column prose",
      "running header repeated on every page",
      "running footer with a page number",
      "paragraph continuing across a page break",
    ],
    async build() {
      const body =
        "The router reads the leading bytes of a file and never its name. " +
        "That decision is what lets a notebook saved with the wrong extension still render, " +
        "and what stops a zip renamed to docx from being handed to a word processor parser. ";
      return renderPdf((doc) => {
        for (let page = 1; page <= 3; page++) {
          doc.addPage({ margins: { top: 90, bottom: 90, left: 72, right: 72 } });
          doc.fontSize(9).text("FileConcat Technical Note — Routing", 72, 40);
          doc.fontSize(11).text(body.repeat(6), 72, 90, { width: 468, align: "justify" });
          doc.fontSize(9).text(`Page ${page} of 3`, 72, 740, { width: 468, align: "center" });
        }
      });
    },
  },

  {
    file: "gen-pdf-two-column.pdf",
    structures: [
      "two-column academic layout",
      "title and abstract spanning both columns",
      "column reading order across a page break",
      "section headings inside a column",
    ],
    async build() {
      const para = (n) =>
        `Section ${n}. Column reading order is the classic failure of flat PDF extraction, ` +
        `because the page has no notion of a column at all: it holds positioned glyphs, ` +
        `and a reader that walks them by vertical position alone interleaves the two columns ` +
        `line by line into unreadable text. This paragraph exists to be long enough that the ` +
        `interleaving is unmistakable when it happens. `;
      return renderPdf((doc) => {
        for (let page = 0; page < 2; page++) {
          doc.addPage({ margins: { top: 72, bottom: 72, left: 54, right: 54 } });
          if (page === 0) {
            doc.fontSize(16).text("On the Reading Order of Multi-Column Documents", 54, 60, {
              width: 504,
              align: "center",
            });
            doc.fontSize(10).text(
              "Abstract. This spans the full width above both columns and must not be " +
                "interleaved with the body below it.",
              54,
              100,
              { width: 504, align: "justify" },
            );
          }
          const top = page === 0 ? 150 : 72;
          doc.fontSize(10).text(para(page * 2 + 1).repeat(3), 54, top, {
            width: 240,
            align: "justify",
          });
          doc.fontSize(10).text(para(page * 2 + 2).repeat(3), 318, top, {
            width: 240,
            align: "justify",
          });
        }
      });
    },
  },

  {
    file: "gen-pdf-two-column-interleaved.pdf",
    structures: [
      "two-column layout whose content stream alternates between the columns",
      "same visual page as gen-pdf-two-column.pdf, opposite stream order",
    ],
    // The companion fixture draws each column in one go, so a reader that
    // simply follows the content stream reads it correctly and a reader that
    // re-sorts by position can get it wrong. This one is the mirror image:
    // the stream alternates line by line across the gutter, so following the
    // stream is what fails and sorting by position is what saves it. Together
    // they say whether the sort helps or hurts, which one file cannot.
    async build() {
      const left = Array.from({ length: 18 }, (_, i) => `Left column line ${i + 1} of eighteen.`);
      const right = Array.from({ length: 18 }, (_, i) => `Right column line ${i + 1} of eighteen.`);
      return renderPdf((doc) => {
        doc.addPage();
        doc.fontSize(10);
        for (let i = 0; i < left.length; i++) {
          const y = 80 + i * 18;
          doc.text(left[i], 54, y, { width: 240, lineBreak: false });
          doc.text(right[i], 318, y, { width: 240, lineBreak: false });
        }
      });
    },
  },

  {
    file: "gen-pdf-table.pdf",
    structures: [
      "table drawn as positioned text with ruling lines",
      "table drawn as positioned text with no ruling lines",
      "right-aligned numeric column",
      "row whose middle cell is empty",
      "prose above and below each table",
    ],
    async build() {
      const rows = [
        ["Region", "Q1", "Q2", "Total"],
        ["EMEA", "1200", "1350", "2550"],
        ["APAC", "980", "", "980"],
        ["AMER", "1440", "1510", "2950"],
      ];
      const cols = [72, 220, 320, 420];
      return renderPdf((doc) => {
        doc.addPage();
        doc.fontSize(11).text("Prose above the ruled table.", 72, 60);

        let y = 100;
        for (const row of rows) {
          row.forEach((value, i) => doc.fontSize(10).text(value, cols[i], y, { lineBreak: false }));
          doc
            .moveTo(72, y + 14)
            .lineTo(520, y + 14)
            .stroke();
          y += 24;
        }
        doc.moveTo(210, 96).lineTo(210, y - 10).stroke();
        doc.moveTo(310, 96).lineTo(310, y - 10).stroke();
        doc.moveTo(410, 96).lineTo(410, y - 10).stroke();

        doc.fontSize(11).text("Prose between the two tables.", 72, y + 16);

        y += 56;
        for (const row of rows) {
          row.forEach((value, i) => doc.fontSize(10).text(value, cols[i], y, { lineBreak: false }));
          y += 20;
        }
        doc.fontSize(11).text("Prose below the unruled table.", 72, y + 16);
      });
    },
  },

  {
    file: "gen-pdf-typography.pdf",
    structures: [
      "ligature glyphs (fi, fl, ffi) from an embedded font",
      "word hyphenated across a line break",
      "curly quotes and an en dash",
      "superscript footnote marker with the note at the page foot",
      "non-ASCII accented characters",
    ],
    async build() {
      return renderPdf((doc) => {
        doc.addPage();
        doc.registerFont("serif", SERIF_TTF);
        doc.font("serif").fontSize(13);
        // FreeSerif carries `liga`, so fontkit substitutes real ligature glyphs
        // here: the content stream holds one glyph where the source had two
        // letters, and only a correct ToUnicode map gets "fi" back out.
        doc.text("The office file classification benefits from efficient workflow.", 72, 80, {
          width: 460,
        });
        doc.text("“Curly quotes” and an en dash – plus ç, ö, ş, ğ.", 72, 120);
        // Split across the line by hand: the second half starts the next line,
        // which is exactly how a justified PDF stores a hyphenated word.
        doc.text("A deliberately hyphen-", 72, 160, { lineBreak: false });
        doc.text("ated word continues here.", 72, 178);
        doc.text("Claim needing support", 72, 220, { lineBreak: false });
        doc.fontSize(8).text("1", 200, 216);
        doc.moveTo(72, 700).lineTo(250, 700).stroke();
        doc.fontSize(8).text("1. The footnote body, printed at the foot of the page.", 72, 706);
      });
    },
  },

  {
    file: "gen-pdf-lists.pdf",
    structures: ["bulleted list", "numbered list", "indented sub-items"],
    async build() {
      return renderPdf((doc) => {
        doc.addPage();
        doc.fontSize(12).text("Checklist", 72, 60);
        doc.fontSize(11);
        doc.text("• Read the bytes", 90, 90);
        doc.text("• Route to a parser", 90, 110);
        doc.text("◦ Office family", 110, 130);
        doc.text("◦ Notebook", 110, 150);
        doc.text("1. Open the document", 90, 190);
        doc.text("2. Pick a renderer", 90, 210);
        doc.text("3. Write the output", 90, 230);
      });
    },
  },

  {
    file: "gen-pdf-scanned.pdf",
    structures: [
      "no text layer at all — a page that is one raster image",
      "recognisable glyphs in the image, so OCR has something to recover",
    ],
    async build() {
      const png = renderScanPng([
        "This page has no text layer.",
        "Every word here is pixels.",
        "Recovering it needs recognition.",
      ]);
      return renderPdf((doc) => {
        doc.addPage();
        doc.image(png, 40, 60, { width: 520 });
      });
    },
  },

  {
    file: "gen-pdf-mixed-scan.pdf",
    structures: [
      "page one carries a real text layer",
      "page two is a raster image with no text",
      "a partly-readable document, which is not the same as a failed one",
    ],
    async build() {
      const png = renderScanPng(["Page two is a scan.", "Page one was not."]);
      return renderPdf((doc) => {
        doc.addPage();
        doc.fontSize(12).text("Page one carries a genuine text layer that extracts normally.", 72, 80, {
          width: 460,
        });
        doc.addPage();
        doc.image(png, 40, 60, { width: 520 });
      });
    },
  },

  {
    file: "gen-pdf-encrypted.pdf",
    structures: ["password-protected (user password required to open)"],
    async build() {
      return renderPdf(
        (doc) => {
          doc.addPage();
          doc.fontSize(12).text("Secret content behind a user password.", 72, 80);
        },
        { userPassword: "letmein", ownerPassword: "owner", pdfVersion: "1.7" },
      );
    },
  },

  /* ============================== ipynb — 18 runs / 16 visits / 7 days ==== */
  {
    file: "gen-ipynb-gaps.ipynb",
    structures: [
      "markdown cell with an embedded image attachment",
      "code cell with no `outputs` key at all",
      "code cell with no `execution_count`",
      "very long stream output",
      "output with several mime types (text/plain beside text/html)",
      "raw cell",
      "empty code cell",
      "cell source given as a plain string rather than a list",
    ],
    async build() {
      const png = renderScanPng(["attachment image"]).toString("base64");
      const notebook = {
        cells: [
          {
            cell_type: "markdown",
            metadata: {},
            attachments: { "figure.png": { "image/png": png } },
            source: ["# Title\n", "\n", "![figure](attachment:figure.png)\n", "\n", "Prose after the figure.\n"],
          },
          {
            cell_type: "code",
            metadata: {},
            execution_count: 1,
            // No `outputs` key at all. The schema requires one, real notebooks
            // written by tooling sometimes omit it, and an indexing read throws.
            source: ["x = 1\n", "print(x)\n"],
          },
          {
            cell_type: "code",
            metadata: {},
            execution_count: null,
            source: "single_string_source = True\n",
            outputs: [],
          },
          {
            cell_type: "code",
            metadata: {},
            execution_count: 2,
            source: ["for i in range(400):\n", "    print(i)\n"],
            outputs: [
              {
                output_type: "stream",
                name: "stdout",
                text: Array.from({ length: 400 }, (_, i) => `${i}\n`),
              },
            ],
          },
          {
            cell_type: "code",
            metadata: {},
            execution_count: 3,
            source: ["df.head()\n"],
            outputs: [
              {
                output_type: "execute_result",
                execution_count: 3,
                metadata: {},
                data: {
                  "text/plain": ["   a  b\n", "0  1  2\n"],
                  "text/html": ["<table><tr><td>1</td><td>2</td></tr></table>\n"],
                },
              },
            ],
          },
          { cell_type: "raw", metadata: {}, source: ["Raw cell content, passed through verbatim.\n"] },
          { cell_type: "code", metadata: {}, execution_count: null, source: [], outputs: [] },
        ],
        metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
        nbformat: 4,
        nbformat_minor: 5,
      };
      return Buffer.from(JSON.stringify(notebook, null, 1));
    },
  },

  /* ============================== rtf / eml / subtitles =================== */
  {
    file: "gen-rtf-document.rtf",
    structures: ["headings via formatting", "bold and italic", "a bulleted list", "a two-column table"],
    async build() {
      const rtf =
        `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\n` +
        `\\fs32\\b Quarterly Report\\b0\\fs24\\par\n` +
        `Revenue by region, in thousands.\\par\n` +
        `{\\pntext\\bullet\\tab}First bullet\\par\n` +
        `{\\pntext\\bullet\\tab}Second bullet\\par\n` +
        `\\trowd\\cellx3000\\cellx6000 Region\\cell Q1\\cell\\row\n` +
        `\\trowd\\cellx3000\\cellx6000 EMEA\\cell 1200\\cell\\row\n` +
        `Closing prose with \\b bold\\b0 and \\i italic\\i0 .\\par\n}`;
      return Buffer.from(rtf, "utf8");
    },
  },

  {
    file: "gen-eml-multipart.eml",
    structures: [
      "multipart/alternative with text and html parts",
      "a base64 attachment",
      "RFC 2047 encoded non-ASCII subject",
      "quoted-printable body",
      "several recipients",
    ],
    async build() {
      const b = "BOUNDARY-7f3a";
      const eml = [
        "From: Ada Lovelace <ada@example.org>",
        "To: Team <team@example.org>, Second <second@example.org>",
        "Cc: Watcher <watcher@example.org>",
        "Subject: =?UTF-8?B?w5ZuZW1saSBSYXBvciDigJQgUTI=?=",
        "Date: Mon, 3 Aug 2026 09:14:00 +0300",
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${b}"`,
        "",
        `--${b}`,
        `Content-Type: multipart/alternative; boundary="${b}-alt"`,
        "",
        `--${b}-alt`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Merhaba,=0A=0AThe plain text alternative with an =C3=B6 in it.",
        "",
        `--${b}-alt`,
        "Content-Type: text/html; charset=UTF-8",
        "",
        "<html><body><p>The <b>html</b> alternative.</p></body></html>",
        "",
        `--${b}-alt--`,
        "",
        `--${b}`,
        'Content-Type: text/csv; name="figures.csv"',
        "Content-Transfer-Encoding: base64",
        'Content-Disposition: attachment; filename="figures.csv"',
        "",
        Buffer.from("Region,Q1\nEMEA,1200\n").toString("base64"),
        "",
        `--${b}--`,
        "",
      ].join("\r\n");
      return Buffer.from(eml, "utf8");
    },
  },

  {
    file: "gen-subtitles.srt",
    structures: ["numbered cues", "multi-line cue text", "inline html styling tags"],
    async build() {
      return Buffer.from(
        [
          "1",
          "00:00:01,000 --> 00:00:04,000",
          "First line of the first cue",
          "second line of the same cue",
          "",
          "2",
          "00:00:04,500 --> 00:00:07,250",
          "<i>Italic cue text</i> and <b>bold</b>",
          "",
          "3",
          "00:00:08,000 --> 00:00:11,000",
          "Final cue.",
          "",
        ].join("\n"),
        "utf8",
      );
    },
  },

  {
    file: "gen-subtitles.vtt",
    structures: ["WEBVTT header", "NOTE comment block", "cue settings on the timestamp line", "named cue"],
    async build() {
      return Buffer.from(
        [
          "WEBVTT",
          "",
          "NOTE This comment should not read as dialogue.",
          "",
          "intro",
          "00:00:01.000 --> 00:00:04.000 line:90% align:middle",
          "First cue with positioning settings",
          "",
          "00:00:04.500 --> 00:00:07.250",
          "<v Speaker>Second cue with a voice span</v>",
          "",
        ].join("\n"),
        "utf8",
      );
    },
  },
];

/* -------------------------------------------------------------------- main */

const written = [];
const failed = [];

for (const entry of CORPUS) {
  try {
    const bytes = await entry.build();
    writeFileSync(join(OUT, entry.file), bytes);
    written.push({ file: entry.file, bytes: bytes.length, structures: entry.structures });
  } catch (error) {
    failed.push({ file: entry.file, structures: entry.structures, error: String(error?.message ?? error) });
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ written, failed }, null, 2));

for (const entry of written) {
  console.log(`ok    ${entry.file.padEnd(30)} ${String(entry.bytes).padStart(8)} B  ${entry.structures.length} structures`);
}
for (const entry of failed) {
  console.log(`FAIL  ${entry.file.padEnd(30)} ${entry.error}`);
}
console.log(`\n${written.length} written, ${failed.length} failed -> manifest.json`);
