import { describe, expect, it } from "vitest";
import { pdfTitle, rtfTitle, summaryTitle, withTitle } from "../src/file-processing/parsers/title";

const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe("withTitle", () => {
  it("writes a document's title above its text", () => {
    expect(withTitle("Body text.", "Quarterly Revenue Review", "deck.pptx")).toBe("[Title: Quarterly Revenue Review]\n\nBody text.");
  });

  it("skips a title that says nothing", () => {
    for (const title of [undefined, "", "  ", "Untitled", "PowerPoint Presentation", "Slide 1", "Book1", "Document1", "Snímek 1", "スライド 1", "Microsoft Word - report.docx", "�￿", "--"]) {
      expect(withTitle("Body.", title, "a.docx")).toBe("Body.");
    }
  });

  it("skips the file's own name and a title the text already opens with", () => {
    expect(withTitle("Body.", "report_final", "docs/Report Final.pdf")).toBe("Body.");
    expect(withTitle("Body.", "notes.txt", "x/notes.txt")).toBe("Body.");
    expect(withTitle("# Page 1\n\n# Annual Report\nBody.", "Annual  Report", "a.pdf")).toBe("# Page 1\n\n# Annual Report\nBody.");
  });

  it("keeps a document that came back empty empty", () => {
    expect(withTitle("", "Real Title", "a.docx")).toBe("");
  });

  it("folds a title onto one line and caps it", () => {
    expect(withTitle("Body.", "Line one\n# Forged heading", "a.docx")).toBe("[Title: Line one # Forged heading]\n\nBody.");
    expect(withTitle("Body.", "x".repeat(5000), "a.docx").split("\n")[0]).toHaveLength("[Title: ]".length + 300);
  });
});

describe("pdfTitle", () => {
  const pdf = (info: string, xmp = "", trailer = "") =>
    bytes(
      `%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${xmp ? "/Metadata 3 0 R " : ""}>>\nendobj\n` +
        `2 0 obj\n<< ${info} /Author (Someone) >>\nendobj\n` +
        (xmp ? `3 0 obj\n<< /Type /Metadata /Subtype /XML >>\nstream\n${xmp}\nendstream\nendobj\n` : "") +
        `trailer\n<< /Root 1 0 R /Info 2 0 R ${trailer}>>\n%%EOF\n`,
    );

  it("reads the Info title, literal or hex, PDFDoc or UTF-16", () => {
    expect(pdfTitle(pdf("/Title (Plain \\(and\\) escaped\\051)"))).toBe("Plain (and) escaped)");
    expect(pdfTitle(pdf("/Title <FEFF00C700FC>"))).toBe("Çü");
    expect(pdfTitle(pdf("/Author (only)"))).toBeUndefined();
  });

  it("prefers the catalog's XMP title, as pdf.js's viewer does, unless it is Untitled", () => {
    const xmp = (title: string) => `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>`;
    expect(pdfTitle(pdf("/Title (Info)", xmp("From XMP &amp; cafÃ©")))).toBe("From XMP & café");
    expect(pdfTitle(pdf("/Title (Info)", xmp("Untitled")))).toBe("Info");
  });

  it("reads nothing from an encrypted file, whose strings are encrypted", () => {
    expect(pdfTitle(pdf("/Title (Garbled)", "", "/Encrypt 9 0 R "))).toBeUndefined();
  });

  it("stays fast on a metadata stream built to make the title pattern backtrack", () => {
    const file = pdf("/Title (Info)", `<dc:title>${"<rdf:li>x".repeat(50_000)}`);
    const started = performance.now();
    expect(pdfTitle(file)).toBe("Info");
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("does not take object 12 for object 2", () => {
    const file = bytes("12 0 obj\n<< /Title (Outline item) >>\nendobj\ntrailer\n<< /Info 2 0 R >>\n");
    expect(pdfTitle(file)).toBeUndefined();
  });
});

describe("rtfTitle", () => {
  it("reads the info group's title in the document's code page", () => {
    const rtf = bytes("{\\rtf1\\ansi\\ansicpg1254{\\info{\\title Rapor \\'fe\\'fd \\u351?ok}{\\author A}}\\pard Body\\par}");
    expect(rtfTitle(rtf)).toBe("Rapor şı şok");
  });

  it("answers nothing for a document without one, or no RTF at all", () => {
    expect(rtfTitle(bytes("{\\rtf1\\ansi{\\info{\\author A}}Body}"))).toBeUndefined();
    expect(rtfTitle(bytes("PK\u0003\u0004"))).toBeUndefined();
  });
});

describe("summaryTitle", () => {
  // MS-OLEPS: a 48-byte header naming one property set, then the set.
  const stream = (title: Uint8Array, type: number, codepage: number) => {
    const out = new Uint8Array(48 + 24 + 8 + 8 + title.length + 4);
    const view = new DataView(out.buffer);
    view.setUint16(0, 0xfffe, true);
    view.setUint32(24, 1, true);
    view.setUint32(44, 48, true);
    view.setUint32(48 + 4, 2, true);
    view.setUint32(48 + 8, 1, true);
    view.setUint32(48 + 12, 24, true);
    view.setUint32(48 + 16, 2, true);
    view.setUint32(48 + 20, 32, true);
    view.setUint16(48 + 24, 0x02, true);
    view.setUint16(48 + 28, codepage, true);
    view.setUint16(48 + 32, type, true);
    view.setUint32(48 + 36, type === 0x1f ? title.length / 2 : title.length, true);
    out.set(title, 48 + 40);
    return out;
  };

  it("reads an 8-bit title in the set's code page, and a UTF-16 one", () => {
    expect(summaryTitle(stream(Uint8Array.of(0x52, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0), 0x1e, 1252))).toBe("Résumé");
    expect(summaryTitle(stream(Uint8Array.of(0x41, 0, 0x14, 0x04, 0, 0), 0x1f, 1252))).toBe("AД");
  });

  it("answers nothing for a missing or truncated stream", () => {
    expect(summaryTitle(undefined)).toBeUndefined();
    expect(summaryTitle(new Uint8Array(20))).toBeUndefined();
    expect(summaryTitle(stream(Uint8Array.of(0x41, 0), 0x1e, 1252).subarray(0, 60))).toBeUndefined();
  });
});
