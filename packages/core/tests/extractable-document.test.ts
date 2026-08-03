import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  EXTRACTABLE_DOCUMENT_EXTENSIONS,
  extractDocument,
  isExtractableDocument,
} from "../src/file-processing/extractable-document";

/** Build a minimal but valid .docx (OOXML zip) carrying a single line of text. */
function minimalDocx(text: string): Uint8Array {
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

describe("isExtractableDocument", () => {
  it("recognizes every extractable document format", () => {
    for (const ext of EXTRACTABLE_DOCUMENT_EXTENSIONS) {
      expect(isExtractableDocument(`report.${ext}`)).toBe(true);
    }
  });

  it("is case-insensitive on the extension", () => {
    expect(isExtractableDocument("Report.PDF")).toBe(true);
    expect(isExtractableDocument("Sheet.XlSx")).toBe(true);
  });

  it("recognizes rtf, whose bytes would otherwise read as plain text", () => {
    expect(isExtractableDocument("brief.rtf")).toBe(true);
  });

  it("rejects plain text, code, and non-extractable binaries", () => {
    expect(isExtractableDocument("index.ts")).toBe(false);
    expect(isExtractableDocument("README.md")).toBe(false);
    expect(isExtractableDocument("photo.png")).toBe(false);
    expect(isExtractableDocument("archive.zip")).toBe(false);
  });

  it("rejects a name with no extension", () => {
    expect(isExtractableDocument("Makefile")).toBe(false);
  });

  it("matches only the final extension, not a substring", () => {
    expect(isExtractableDocument("notes.pdf.txt")).toBe(false);
  });
});

describe("extractDocument", () => {
  it("extracts the text from a docx", async () => {
    const text = await extractDocument(minimalDocx("Hello extractable document"));
    expect(text).toContain("Hello extractable document");
  });

  it("returns an empty string when the document carries no recoverable text", async () => {
    const text = await extractDocument(minimalDocx(""));
    expect(text).toBe("");
  });

  it("extracts the prose from an rtf, not its markup", async () => {
    const rtf =
      `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\n` +
      `\\f0\\fs24 Hello from RTF. \\par\n` +
      `Second paragraph with \\b bold\\b0  text.\\par\n}`;
    const text = await extractDocument(strToU8(rtf));
    expect(text).toContain("Hello from RTF.");
    expect(text).toContain("bold");
    expect(text).not.toContain("\\rtf1");
    expect(text).not.toContain("fonttbl");
  });
});
