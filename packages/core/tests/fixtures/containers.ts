import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Build a minimal but valid .docx (OOXML zip) carrying a single line of text. */
export function minimalDocx(text: string): Uint8Array {
  return docxWithBody(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`);
}

/** The same .docx with the given `w:body` markup. */
export function docxWithBody(body: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${body}</w:body>` +
        `</w:document>`,
    ),
  });
}

const XML_DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

/**
 * A `.docx` carrying the structures a flat-text reader is most likely to
 * destroy: a heading, prose, and a three-column table whose first row is a
 * single heading merged across all three. `minimalDocx` only ever proved that
 * *some* characters come out.
 *
 * `w:gridSpan` is what Word itself writes for a horizontal merge, so this is
 * the same attribute a hand-authored document carries.
 */
export function tableDocx(): Uint8Array {
  const cell = (t: string, span = 1) =>
    `<w:tc>${span > 1 ? `<w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>` : ""}` +
    `<w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  // Wrapped rather than passed to `map` directly: `map` hands the index along,
  // which this signature would read as a span.
  const row = (cells: readonly string[]) =>
    `<w:tr>${cells.map((c) => cell(c)).join("")}</w:tr>`;
  const para = (t: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${t}</w:t></w:r></w:p>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(
      XML_DECL +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        para("Quarterly Report", "Heading1") +
        para("Revenue by region, in thousands.") +
        para("Method Notes", "Heading2") +
        `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>` +
        `<w:tr>${cell("Half-year totals", 3)}</w:tr>` +
        row(["Region", "Q1", "Q2"]) +
        row(["EMEA", "1200", "1350"]) +
        row(["APAC", "980", "1105"]) +
        `</w:tbl>` +
        `</w:body></w:document>`,
    ),
  });
}

/**
 * A `.docx` whose page header carries a confidentiality marking, plus a footer
 * that is the literal prefix of a page-number field. Both live in their own
 * parts of the package rather than in the document body, which is exactly why
 * a reader that walks only the body loses them without noticing.
 *
 * The same header part is referenced twice, as Word does when a section has a
 * different first page.
 */
export function furnitureDocx(): Uint8Array {
  const part = (root: string, text: string) =>
    XML_DECL +
    `<w:${root} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` +
    `</w:${root}>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(
      XML_DECL +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>The body of the document, which is all a reader sees today.</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
    ),
    "word/header1.xml": strToU8(part("hdr", "CONFIDENTIAL - Internal Distribution Only")),
    "word/header2.xml": strToU8(part("hdr", "CONFIDENTIAL - Internal Distribution Only")),
    "word/footer1.xml": strToU8(part("ftr", "Page")),
  });
}

/**
 * A `.docx` whose meaning is not in its visible characters: a link whose
 * destination lives only in the relationships part, a second link whose text
 * already is its destination, and two claims in one sentence each carrying its
 * own footnote. Flat text loses all of it silently unless the extractor writes
 * the destinations and the markers out.
 */
export function referencesDocx(): Uint8Array {
  const run = (t: string) => `<w:r><w:t>${t}</w:t></w:r>`;
  const link = (id: string, t: string) => `<w:hyperlink r:id="${id}">${run(t)}</w:hyperlink>`;
  const ref = (id: string) => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;
  const footnote = (id: string, t: string) =>
    `<w:footnote w:id="${id}"><w:p>${run(t)}</w:p></w:footnote>`;
  const rel = (id: string, type: string, target: string, mode?: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" ` +
    `Target="${target}"${mode ? ` TargetMode="${mode}"` : ""}/>`;
  const WORD_NS =
    `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rel("rId1", "officeDocument", "word/document.xml") +
        `</Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rel("rId1", "hyperlink", "https://fileconcat.com/docs/introduction", "External") +
        rel("rId2", "hyperlink", "https://example.org/feed.json", "External") +
        rel("rId3", "footnotes", "footnotes.xml") +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(
      XML_DECL +
        `<w:document ${WORD_NS}><w:body>` +
        `<w:p>` +
        run("Revenue rose 12 percent") +
        ref("1") +
        run(" against a flat market") +
        ref("2") +
        run(".") +
        `</w:p>` +
        `<w:p>` +
        run("Full methodology at ") +
        link("rId1", "our documentation") +
        run(" and the raw feed at ") +
        link("rId2", "https://example.org/feed.json") +
        run(".") +
        `</w:p>` +
        `</w:body></w:document>`,
    ),
    "word/footnotes.xml": strToU8(
      XML_DECL +
        `<w:footnotes ${WORD_NS}>` +
        footnote("1", "Measured on 2026-08-15.") +
        footnote("2", "Second note, on the same page.") +
        `</w:footnotes>`,
    ),
  });
}

/**
 * A two-sheet `.xlsx`. Both halves matter: the cell values are adjacent numbers
 * that concatenate into a plausible-looking third number when a reader forgets
 * the separator, and the two sheets are what proves the boundary between them
 * survived. `contentType` is the package's main part type: the default is a
 * plain workbook, `SHEET_MACRO_ENABLED` turns the same bytes into an `.xlsm`.
 */
export const SHEET_MACRO_ENABLED = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";

export function twoSheetXlsx(
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
): Uint8Array {
  const cellXml = (ref: string, value: string | number) =>
    typeof value === "number"
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const sheetXml = (rows: ReadonlyArray<ReadonlyArray<string | number>>) =>
    XML_DECL +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    rows
      .map(
        (cells, r) =>
          `<row r="${r + 1}">` +
          cells.map((v, i) => cellXml(`${String.fromCharCode(65 + i)}${r + 1}`, v)).join("") +
          `</row>`,
      )
      .join("") +
    `</sheetData></worksheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${contentType}"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      XML_DECL +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Revenue" sheetId="1" r:id="rId1"/><sheet name="Headcount" sheetId="2" r:id="rId2"/></sheets>` +
        `</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
        `</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      sheetXml([
        ["Region", "Q1", "Q2"],
        ["EMEA", 1200, 1350],
        ["APAC", 980, 1105],
      ]),
    ),
    "xl/worksheets/sheet2.xml": strToU8(
      sheetXml([
        ["Team", "People"],
        ["Eng", 42],
      ]),
    ),
  });
}

/**
 * A two-slide `.pptx`. The interesting part is the seam: the last line of slide
 * one and the title of slide two are both ordinary lines of text, so nothing
 * but an explicit marker can tell a reader where one slide ended.
 *
 * Slide one carries a speaker note shaped the way PowerPoint writes one: a
 * sentence, plus a line holding nothing but the slide's number, which the notes
 * master's slide-number placeholder puts there. The slide names its notes
 * through a relationship, which is how officeparser 8 finds them.
 */
export function twoSlidePptx(): Uint8Array {
  return deckPptx(
    [
      { shapes: [{ lines: ["Roadmap", "Ship the parser", "Measure quality"] }] },
      { shapes: [{ lines: ["Risks", "Tables collapse", "Sheets merge"] }] },
    ],
    { 1: ["Open with the counters", "1"] },
  );
}

/** One shape on a slide: its lines, and the placeholder type it fills, if any. */
interface DeckShape {
  ph?: string;
  lines: readonly string[];
}

/**
 * A `.pptx` of the given slides, numbered from 1, with speaker notes by slide
 * number. A shape with `ph` is a placeholder of that type (`ftr`, `dt`,
 * `sldNum`), the way PowerPoint writes the footer, date and slide number.
 */
export function deckPptx(
  slides: readonly { shapes: readonly DeckShape[]; hidden?: boolean }[],
  notes: Record<number, readonly string[]> = {},
): Uint8Array {
  const shapeXml = ({ ph, lines }: DeckShape) =>
    `<p:sp>` +
    (ph ? `<p:nvSpPr><p:cNvPr id="2" name="${ph}"/><p:cNvSpPr/><p:nvPr><p:ph type="${ph}"/></p:nvPr></p:nvSpPr>` : "") +
    `<p:txBody>` +
    lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("") +
    `</p:txBody></p:sp>`;
  const slideXml = (shapes: readonly DeckShape[], hidden = false) =>
    XML_DECL +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${hidden ? ` show="0"` : ""}>` +
    `<p:cSld><p:spTree>` +
    shapes.map(shapeXml).join("") +
    `</p:spTree></p:cSld></p:sld>`;
  const numbers = slides.map((_, index) => index + 1);

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
        numbers
          .map(
            (n) =>
              `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
        `</Relationships>`,
    ),
    "ppt/presentation.xml": strToU8(
      XML_DECL +
        `<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
        `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        `<p:sldIdLst>` +
        numbers.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("") +
        `</p:sldIdLst></p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        numbers
          .map(
            (n) =>
              `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
          )
          .join("") +
        `</Relationships>`,
    ),
    ...Object.fromEntries(
      slides.map((slide, index) => [`ppt/slides/slide${index + 1}.xml`, strToU8(slideXml(slide.shapes, slide.hidden))]),
    ),
    ...Object.fromEntries(
      Object.entries(notes).map(([n, lines]) => [`ppt/notesSlides/notesSlide${n}.xml`, strToU8(slideXml([{ lines }]))]),
    ),
    ...Object.fromEntries(
      Object.keys(notes).map((n) => [
        `ppt/slides/_rels/slide${n}.xml.rels`,
        strToU8(
          XML_DECL +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>` +
            `</Relationships>`,
        ),
      ]),
    ),
  });
}

/**
 * Build a minimal OpenDocument text file. The `mimetype` entry must be first
 * and stored uncompressed — that is exactly what tells an `.odt` apart from a
 * plain zip, so storing it any other way would defeat the fixture.
 */
/**
 * A `.docx` whose second paragraph carries a review comment, wired the way
 * Word writes one: a range and a reference in the body, the comment's text in
 * `word/comments.xml`, found through the document's relationships.
 */
export function commentedDocx(): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const parts = unzipSync(
    docxWithBody(
      "<w:p><w:r><w:t>Plain line.</w:t></w:r></w:p>" +
        '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t xml:space="preserve">Reviewed </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>line.</w:t></w:r><w:commentRangeEnd w:id="0"/>' +
        '<w:r><w:commentReference w:id="0"/></w:r></w:p>',
    ),
  );
  parts["[Content_Types].xml"] = strToU8(
    strFromU8(parts["[Content_Types].xml"]).replace(
      "</Types>",
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>',
    ),
  );
  parts["word/_rels/document.xml.rels"] = strToU8(
    XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
      `</Relationships>`,
  );
  parts["word/comments.xml"] = strToU8(
    XML_DECL +
      `<w:comments ${W}><w:comment w:id="0" w:author="Ada\nYilmaz" w:initials="AY">` +
      "<w:p><w:r><w:t>Check this</w:t></w:r></w:p><w:p><w:r><w:t>figure.</w:t></w:r></w:p></w:comment></w:comments>",
  );
  return zipSync(parts);
}

/**
 * `twoSheetXlsx` with two notes on its first sheet, as Excel saves them: a
 * legacy note whose text opens with its author's name, and a threaded comment
 * that the legacy part holds only as Excel's fallback text, under the thread id.
 */
export function commentedXlsx(
  thread = "[Threaded comment]\n\nYour version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924\n\n" +
    "Comment:\n    Is this final?\nReply:\n    Yes.",
): Uint8Array {
  const parts = unzipSync(twoSheetXlsx());
  parts["[Content_Types].xml"] = strToU8(
    strFromU8(parts["[Content_Types].xml"]).replace(
      "</Types>",
      '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>',
    ),
  );
  parts["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(
    XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>` +
      `</Relationships>`,
  );
  parts["xl/comments1.xml"] = strToU8(
    XML_DECL +
      `<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Ada</author><author>tc={6D2B3A10-0000-0000-0000-000000000000}</author></authors><commentList>` +
      `<comment ref="A1" authorId="0"><text><r><t xml:space="preserve">Ada:\nCheck the region.</t></r></text></comment>` +
      `<comment ref="B2" authorId="1"><text><t xml:space="preserve">${thread}</t></text></comment>` +
      `</commentList></comments>`,
  );
  return zipSync(parts);
}

/** An OpenDocument file of `kind` (text, spreadsheet) holding `body`. */
export function odfDocument(kind: string, body: string): Uint8Array {
  const ns =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/"';
  return zipSync(
    {
      mimetype: strToU8(`application/vnd.oasis.opendocument.${kind}`),
      "content.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:body><office:${kind}>${body}</office:${kind}></office:body></office:document-content>`,
      ),
    },
    { level: 0 },
  );
}

/**
 * An OpenDocument spreadsheet whose first row spans two columns: `B1` is a
 * covered cell, so `QZAFTER` belongs in column C.
 */
export function spannedOds(): Uint8Array {
  const ns =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
  const cell = (text: string, attrs = "") => `<table:table-cell office:value-type="string"${attrs}><text:p>${text}</text:p></table:table-cell>`;
  return zipSync(
    {
      mimetype: strToU8("application/vnd.oasis.opendocument.spreadsheet"),
      "content.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:body><office:spreadsheet>` +
          '<table:table table:name="Sheet1">' +
          `<table:table-row>${cell("QZMERGED", ' table:number-columns-spanned="2" table:number-rows-spanned="1"')}<table:covered-table-cell/>${cell("QZAFTER")}</table:table-row>` +
          `<table:table-row>${cell("A2")}${cell("B2")}${cell("C2")}</table:table-row>` +
          "</table:table></office:spreadsheet></office:body></office:document-content>",
      ),
    },
    { level: 0 },
  );
}

export function minimalOdt(): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/vnd.oasis.opendocument.text"),
      "content.xml": strToU8(`<office:document-content xmlns:office="urn:odf"/>`),
    },
    { level: 0 },
  );
}

/**
 * A minimal but valid EPUB: `mimetype` first and stored (the same trick as
 * OpenDocument, and what the detector keys on), the container manifest naming
 * the OPF, an OPF whose spine holds one XHTML chapter carrying `text`.
 */
export function minimalEpub(text = ""): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8(
        `<?xml version="1.0"?>` +
          `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
          `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>` +
          `</container>`,
      ),
      "OEBPS/content.opf": strToU8(
        `<?xml version="1.0"?>` +
          `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0" unique-identifier="id">` +
          `<metadata><dc:identifier id="id">fixture</dc:identifier><dc:title>Fixture</dc:title></metadata>` +
          `<manifest><item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>` +
          `<spine><itemref idref="ch1"/></spine>` +
          `</package>`,
      ),
      "OEBPS/chapter1.xhtml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>` +
          `<body><h1>Chapter 1</h1><p>${text}</p></body></html>`,
      ),
    },
    { level: 0 },
  );
}

/** A plain zip of source files — the container `.docx` must not be confused with. */
export function plainZip(): Uint8Array {
  return zipSync({
    "src/index.ts": strToU8(`export const answer = 42;\n`),
    "README.md": strToU8(`# Project\n`),
    "__MACOSX/._junk": strToU8("cruft"),
    ".DS_Store": strToU8("cruft"),
  });
}

/**
 * One 512-byte tar header with a valid checksum. `magic` is the `ustar` field;
 * pass an empty string to build a pre-POSIX v7 header, which carries none.
 */
function tarHeader(name: string, size: number, magic: string, type = "0"): Uint8Array {
  const block = new Uint8Array(512);
  const enc = new TextEncoder();
  const put = (offset: number, value: string) => block.set(enc.encode(value), offset);

  put(0, name);
  put(100, "0000644\0"); // mode
  put(108, "0000000\0"); // uid
  put(116, "0000000\0"); // gid
  put(124, size.toString(8).padStart(11, "0") + "\0");
  put(136, "00000000000\0"); // mtime
  put(148, "        "); // checksum, summed as spaces
  block[156] = type.charCodeAt(0); // typeflag, '0' a regular file
  if (magic) put(257, magic);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += block[i];
  put(148, sum.toString(8).padStart(6, "0") + "\0 ");
  return block;
}

/**
 * Assemble a tar from `name -> content`, with the two trailing zero blocks. A
 * list of `[name, content, typeflag]` builds other header types (pax `x`).
 */
export function makeTar(
  files: Record<string, string> | [string, string, string][],
  magic = "ustar\x0000",
): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const rows = Array.isArray(files) ? files : Object.entries(files).map(([n, c]) => [n, c, "0"]);
  for (const [name, content, type] of rows) {
    const data = enc.encode(content);
    blocks.push(tarHeader(name, data.length, magic, type));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024)); // end-of-archive

  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

const C_NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relsXml = (...rels: [id: string, type: string, target: string][]) =>
  XML_DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rels.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join("") +
  `</Relationships>`;

/**
 * A clustered bar chart part as PowerPoint and Excel write one: a title with an
 * entity in it, two series over two categories, a custom data label on one
 * point, a category and a value axis with titles, and an extension list whose
 * cached text is no data.
 */
export const BAR_CHART =
  XML_DECL +
  `<c:chartSpace ${C_NS}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Sales R&amp;D</a:t></a:r></a:p></c:rich></c:tx></c:title>` +
  `<c:plotArea><c:barChart>` +
  [
    ["North", ["10", "20"], `<c:dLbls><c:dLbl><c:idx val="1"/><c:tx><c:rich><a:p><a:r><a:t>peak</a:t></a:r></a:p></c:rich></c:tx></c:dLbl></c:dLbls>`],
    ["South", ["30", "40"], ""],
  ]
    .map(
      ([name, values, labels]) =>
        `<c:ser><c:idx val="0"/><c:tx><c:strRef><c:f>S!$B$1</c:f><c:strCache><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx>${labels}` +
        `<c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:strRef></c:cat>` +
        `<c:val><c:numRef><c:numCache><c:formatCode>General</c:formatCode>` +
        (values as string[]).map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("") +
        `</c:numCache></c:numRef></c:val>` +
        `<c:extLst><c:ext><c15:filteredSeriesTitle xmlns:c15="x"><c15:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>QZEXT</c:v></c:pt></c:strCache></c:strRef></c15:tx></c15:filteredSeriesTitle></c:ext></c:extLst></c:ser>`,
    )
    .join("") +
  `</c:barChart>` +
  `<c:catAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Quarter</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx>` +
  `<c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>USD</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>` +
  `</c:plotArea></c:chart></c:chartSpace>`;

/** The lines a reader should give for {@link BAR_CHART} with the given alt text. */
export const BAR_CHART_LABEL = (alt = "") => `[Chart, bar: Sales R&D${alt ? `; ${alt}` : ""}; values: USD]`;

const chartFrame = (id: string) =>
  `<a:graphic ${C_NS}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart ${R_NS} r:id="${id}"/></a:graphicData></a:graphic>`;

/** A docx whose middle paragraph holds {@link BAR_CHART}, with alt text, between two of prose. */
export function chartedDocx(): Uint8Array {
  const parts = unzipSync(
    docxWithBody(
      `<w:p><w:r><w:t>Before</w:t></w:r></w:p>` +
        `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="Chart 1" descr="Bars by quarter"/>${chartFrame("rIdC")}</wp:inline></w:drawing></w:r></w:p>` +
        `<w:p><w:r><w:t>After</w:t></w:r></w:p>`,
    ),
  );
  parts["word/_rels/document.xml.rels"] = strToU8(relsXml(["rIdC", "chart", "charts/chart1.xml"]));
  parts["word/charts/chart1.xml"] = strToU8(BAR_CHART);
  return zipSync(parts);
}

/** A one-slide deck whose slide holds a line of text and then {@link BAR_CHART}. */
export function chartedPptx(): Uint8Array {
  const parts = unzipSync(deckPptx([{ shapes: [{ lines: ["Results"] }] }]));
  parts["ppt/slides/slide1.xml"] = strToU8(
    strFromU8(parts["ppt/slides/slide1.xml"]).replace(
      "</p:spTree>",
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Chart 2"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${chartFrame("rIdC")}</p:graphicFrame></p:spTree>`,
    ),
  );
  parts["ppt/slides/_rels/slide1.xml.rels"] = strToU8(relsXml(["rIdC", "chart", "../charts/chart1.xml"]));
  parts["ppt/charts/chart1.xml"] = strToU8(BAR_CHART);
  return zipSync(parts);
}

/**
 * {@link twoSheetXlsx} with a text box and {@link BAR_CHART} drawn on the
 * first sheet, the second sheet hidden, and a chartsheet after them whose
 * chart has only a title. The chartsheet's part is `sheet1.xml` too, as Excel
 * names it, which is the name officeparser keyed the first sheet's name by.
 */
export function chartedXlsx(): Uint8Array {
  const parts = unzipSync(twoSheetXlsx());
  const XDR = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const anchor = (body: string) => `<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="1" cy="1"/>${body}<xdr:clientData/></xdr:absoluteAnchor>`;
  const frame = `<xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="3" name="Chart 2"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>${chartFrame("rId1")}</xdr:graphicFrame>`;
  parts["xl/workbook.xml"] = strToU8(
    strFromU8(parts["xl/workbook.xml"])
      .replace('r:id="rId2"/>', 'state="hidden" r:id="rId2"/>')
      .replace("</sheets>", '<sheet name="Trend" sheetId="3" r:id="rId3"/></sheets>'),
  );
  parts["xl/_rels/workbook.xml.rels"] = strToU8(
    strFromU8(parts["xl/_rels/workbook.xml.rels"]).replace(
      "</Relationships>",
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/></Relationships>',
    ),
  );
  parts["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(relsXml(["rId1", "drawing", "../drawings/drawing1.xml"]));
  parts["xl/drawings/drawing1.xml"] = strToU8(
    XML_DECL +
      `<xdr:wsDr ${XDR}>` +
      anchor(`<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="2" name="TextBox 1"/></xdr:nvSpPr><xdr:txBody><a:p><a:r><a:t>Read me</a:t></a:r></a:p><a:p><a:r><a:t>first</a:t></a:r></a:p></xdr:txBody></xdr:sp>`) +
      anchor(frame) +
      `</xdr:wsDr>`,
  );
  parts["xl/drawings/_rels/drawing1.xml.rels"] = strToU8(relsXml(["rId1", "chart", "../charts/chart1.xml"]));
  parts["xl/charts/chart1.xml"] = strToU8(BAR_CHART);
  parts["xl/chartsheets/sheet1.xml"] = strToU8(
    XML_DECL + `<chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${R_NS}><drawing r:id="rId1"/></chartsheet>`,
  );
  parts["xl/chartsheets/_rels/sheet1.xml.rels"] = strToU8(relsXml(["rId1", "drawing", "../drawings/drawing2.xml"]));
  parts["xl/drawings/drawing2.xml"] = strToU8(XML_DECL + `<xdr:wsDr ${XDR}>${anchor(frame)}</xdr:wsDr>`);
  parts["xl/drawings/_rels/drawing2.xml.rels"] = strToU8(relsXml(["rId1", "chart", "../charts/chart2.xml"]));
  parts["xl/charts/chart2.xml"] = strToU8(
    XML_DECL + `<c:chartSpace ${C_NS}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Trend</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:lineChart/></c:plotArea></c:chart></c:chartSpace>`,
  );
  return zipSync(parts);
}

/**
 * An OpenDocument file of `kind` holding `body`, with a bar chart object at
 * `Object 1`, its data in its own table as LibreOffice writes it. A frame in
 * the body places it: `<draw:frame><draw:object xlink:href="./Object 1"/></draw:frame>`.
 */
export function chartedOdf(kind: string, body: string): Uint8Array {
  const parts = unzipSync(odfDocument(kind, body));
  const cell = (text: string) => `<table:table-cell><text:p>${text}</text:p></table:table-cell>`;
  parts["Object 1/content.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
      `xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ` +
      `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:chart>` +
      `<chart:chart chart:class="chart:bar"><chart:title><text:p>Uptime</text:p></chart:title>` +
      `<chart:plot-area><chart:axis chart:dimension="x"><chart:title><text:p>Month</text:p></chart:title></chart:axis></chart:plot-area>` +
      `<table:table table:name="local-table"><table:table-header-rows><table:table-row><table:table-cell/>${cell("Site")}</table:table-row></table:table-header-rows>` +
      `<table:table-rows><table:table-row>${cell("Jan")}${cell("99.5")}</table:table-row></table:table-rows></table:table>` +
      `</chart:chart></office:chart></office:body></office:document-content>`,
  );
  return zipSync(parts, { level: 0 });
}
