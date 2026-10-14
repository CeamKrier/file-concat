import { strToU8, zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { noteLayersOff, pdfLayersOff } from "../src/file-processing/parsers/pdf-layers";

const catalog = (off: string) =>
  `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [19 0 R 20 0 R] /D << /ON [20 0 R] /OFF ${off} >> >> >>`;
const pdf = (body: string) => strToU8(`%PDF-1.7\n1 0 obj\n${body}\nendobj\n%%EOF\n`);
/** The catalog compressed into an object stream, as a PDF 1.5 save writes it. */
const inObjectStream = (body: string) => {
  const data = zlibSync(strToU8(`1 0 ${body}`));
  return new Uint8Array([
    ...strToU8(`%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${data.length} /Filter /FlateDecode >>\nstream\r\n`),
    ...data,
    ...strToU8("\nendstream\nendobj\n%%EOF\n"),
  ]);
};

describe("pdfLayersOff", () => {
  it("finds a layer switched off in the catalog or in an object stream", () => {
    expect(pdfLayersOff(pdf(catalog("[19 0 R]")))).toBe(true);
    expect(pdfLayersOff(inObjectStream(catalog("[19 0 R]")))).toBe(true);
    expect(pdfLayersOff(inObjectStream(catalog("10 0 R")))).toBe(true);
  });

  it("finds none when every layer is on, or there are no layers", () => {
    expect(pdfLayersOff(pdf(catalog("[]")))).toBe(false);
    expect(pdfLayersOff(inObjectStream(catalog("[ ]")))).toBe(false);
    // A usage dictionary's state is a name, not the list.
    expect(pdfLayersOff(pdf(`${catalog("[]")} << /Usage << /View << /ViewState /OFF >> >> >>`))).toBe(false);
    expect(pdfLayersOff(pdf("<< /Type /Catalog /Pages 2 0 R /OFF [19 0 R] >>"))).toBe(false);
  });

  it("scans a file of unclosed arrays and bombs in bounded time", () => {
    const started = performance.now();
    expect(pdfLayersOff(pdf(`/OCProperties ${"/OFF [".repeat(200_000)}`))).toBe(false);
    const bomb = inObjectStream(`/X (${"A".repeat(50_000_000)})`);
    expect(pdfLayersOff(bomb)).toBe(false);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("noteLayersOff", () => {
  it("says so over the text and in a note, and leaves an empty reading alone", () => {
    const bytes = pdf(catalog("[19 0 R]"));
    expect(noteLayersOff({ text: "# Page 1\nBody" }, bytes)).toEqual({
      text: "(This PDF has layers a viewer hides. Their text is included below.)\n\n# Page 1\nBody",
      notes: [{ kind: "layers-off" }],
    });
    expect(noteLayersOff({ text: "" }, bytes)).toEqual({ text: "" });
    expect(noteLayersOff({ text: "Body" }, pdf(catalog("[]")))).toEqual({ text: "Body" });
  });
});
