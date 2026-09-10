/**
 * A directory holding one source file and one document of each office format,
 * every one carrying a sentence that appears nowhere else. Whether a tool's
 * bundle contains the sentence says whether the tool read the document or only
 * listed it, which is the E4 probe of `docs/tool-effectiveness-plan.md`.
 *
 * The documents are written by hand, as the smallest files the formats allow,
 * rather than borrowed from the extraction corpus: the corpus is gitignored, and
 * a probe that a reader can regenerate from the script is one they can repeat.
 * The office files are STORED zips of minimal OOXML parts; the PDF is one page,
 * one Helvetica text object, uncompressed. Real documents are larger and richer,
 * and nothing here measures extraction quality; `measure-extraction` does that.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

/** File name in the fixture to the sentence its text must contain. */
export const DOCUMENT_FIXTURE: Record<string, string> = {
  "main.ts": "Pallet routing rejects a manifest whose seal code is 7Q-4418",
  "report.pdf": "The audited unit count for the Marrow depot was 4812337",
  "notes.docx": "Quorum for the Halvern review is nine seats, not eleven",
  "figures.xlsx": "Kestrel line yield in week 31 was 0.9174 of nominal",
  "deck.pptx": "The Oxbow rollout moves to Cedar Falls in phase three",
};

export function writeDocumentFixture(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const s = DOCUMENT_FIXTURE;
  fs.writeFileSync(
    path.join(dir, "main.ts"),
    `// ${s["main.ts"]}\nexport const seal = "7Q-4418";\n`,
  );
  fs.writeFileSync(path.join(dir, "report.pdf"), pdf(s["report.pdf"]));
  fs.writeFileSync(path.join(dir, "notes.docx"), docx(s["notes.docx"]));
  fs.writeFileSync(path.join(dir, "figures.xlsx"), xlsx(s["figures.xlsx"]));
  fs.writeFileSync(path.join(dir, "deck.pptx"), pptx(s["deck.pptx"]));
}

function pdf(sentence: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${sentence}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const contentTypes = (overrides: [string, string][]) =>
  XML +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  overrides
    .map(([part, type]) => `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`)
    .join("") +
  "</Types>";

const rels = (entries: [string, string, string][]) =>
  XML +
  `<Relationships xmlns="${PKG_REL}">` +
  entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${DOC_REL}/${type}" Target="${target}"/>`).join("") +
  "</Relationships>";

function docx(sentence: string): Buffer {
  return zip([
    ["[Content_Types].xml", contentTypes([["/word/document.xml", "wordprocessingml.document.main+xml"]])],
    [
      "word/document.xml",
      XML +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' +
        sentence +
        "</w:t></w:r></w:p></w:body></w:document>",
    ],
    ["_rels/.rels", rels([["rId1", "officeDocument", "word/document.xml"]])],
  ]);
}

function xlsx(sentence: string): Buffer {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return zip([
    [
      "[Content_Types].xml",
      contentTypes([
        ["/xl/workbook.xml", "spreadsheetml.sheet.main+xml"],
        ["/xl/worksheets/sheet1.xml", "spreadsheetml.worksheet+xml"],
        ["/xl/sharedStrings.xml", "spreadsheetml.sharedStrings+xml"],
      ]),
    ],
    [
      "xl/workbook.xml",
      XML +
        `<workbook xmlns="${main}" xmlns:r="${DOC_REL}"><sheets><sheet name="Figures" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      rels([
        ["rId1", "worksheet", "worksheets/sheet1.xml"],
        ["rId2", "sharedStrings", "sharedStrings.xml"],
      ]),
    ],
    ["xl/sharedStrings.xml", XML + `<sst xmlns="${main}" count="1" uniqueCount="1"><si><t>${sentence}</t></si></sst>`],
    [
      "xl/worksheets/sheet1.xml",
      XML + `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
    ],
    ["_rels/.rels", rels([["rId1", "officeDocument", "xl/workbook.xml"]])],
  ]);
}

function pptx(sentence: string): Buffer {
  const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
  return zip([
    [
      "[Content_Types].xml",
      contentTypes([
        ["/ppt/presentation.xml", "presentationml.presentation.main+xml"],
        ["/ppt/slides/slide1.xml", "presentationml.slide+xml"],
      ]),
    ],
    [
      "ppt/presentation.xml",
      XML + `<p:presentation xmlns:p="${p}" xmlns:r="${DOC_REL}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    ],
    ["ppt/_rels/presentation.xml.rels", rels([["rId1", "slide", "slides/slide1.xml"]])],
    [
      "ppt/slides/slide1.xml",
      XML +
        `<p:sld xmlns:a="${a}" xmlns:p="${p}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>` +
        sentence +
        "</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>",
    ],
    ["_rels/.rels", rels([["rId1", "officeDocument", "ppt/presentation.xml"]])],
  ]);
}

/**
 * A STORED zip, entries in the order given. `[Content_Types].xml` first and the
 * main part second, because the router sniffs the first 8 KiB and the file-type
 * detector names the format from the first entry it sees under `word/`, `xl/`
 * or `ppt/`.
 */
function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}
