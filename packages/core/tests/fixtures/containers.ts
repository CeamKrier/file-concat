import { strToU8, zipSync } from "fflate";

/** Build a minimal but valid .docx (OOXML zip) carrying a single line of text. */
export function minimalDocx(text: string): Uint8Array {
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
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>` +
        `</w:document>`,
    ),
  });
}

const XML_DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

/**
 * A `.docx` carrying the structures a flat-text reader is most likely to
 * destroy: a heading, prose, and a three-column table. `minimalDocx` only ever
 * proved that *some* characters come out.
 */
export function tableDocx(): Uint8Array {
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const row = (cells: readonly string[]) => `<w:tr>${cells.map(cell).join("")}</w:tr>`;
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
        `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>` +
        row(["Region", "Q1", "Q2"]) +
        row(["EMEA", "1200", "1350"]) +
        row(["APAC", "980", "1105"]) +
        `</w:tbl>` +
        `</w:body></w:document>`,
    ),
  });
}

/**
 * A two-sheet `.xlsx`. Both halves matter: the cell values are adjacent numbers
 * that concatenate into a plausible-looking third number when a reader forgets
 * the separator, and the two sheets are what proves the boundary between them
 * survived.
 */
export function twoSheetXlsx(): Uint8Array {
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
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
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
 */
export function twoSlidePptx(): Uint8Array {
  const slideXml = (lines: readonly string[]) =>
    XML_DECL +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody>` +
    lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("") +
    `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      XML_DECL +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
        `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
        `<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
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
        `<p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>` +
        `</p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>` +
        `</Relationships>`,
    ),
    "ppt/slides/slide1.xml": strToU8(
      slideXml(["Roadmap", "Ship the parser", "Measure quality"]),
    ),
    "ppt/slides/slide2.xml": strToU8(slideXml(["Risks", "Tables collapse", "Sheets merge"])),
  });
}

/**
 * Build a minimal OpenDocument text file. The `mimetype` entry must be first
 * and stored uncompressed — that is exactly what tells an `.odt` apart from a
 * plain zip, so storing it any other way would defeat the fixture.
 */
export function minimalOdt(): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/vnd.oasis.opendocument.text"),
      "content.xml": strToU8(`<office:document-content xmlns:office="urn:odf"/>`),
    },
    { level: 0 },
  );
}

/** A minimal EPUB. Same `mimetype`-first trick as OpenDocument. */
export function minimalEpub(): Uint8Array {
  return zipSync(
    {
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8(`<container version="1.0"/>`),
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
function tarHeader(name: string, size: number, magic: string): Uint8Array {
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
  block[156] = 0x30; // typeflag '0' — regular file
  if (magic) put(257, magic);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += block[i];
  put(148, sum.toString(8).padStart(6, "0") + "\0 ");
  return block;
}

/** Assemble a tar from `name -> content`, with the two trailing zero blocks. */
export function makeTar(files: Record<string, string>, magic = "ustar\x0000"): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = enc.encode(content);
    blocks.push(tarHeader(name, data.length, magic));
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
