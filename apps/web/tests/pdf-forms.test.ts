import { describe, expect, it } from "vitest";
import { readPdfForms, withPdfForms, type PdfJs } from "~/lib/pdf-forms";

/** pdf.js as `readPdfForms` sees it: each page's annotations and the document's files. */
function pdfjs(pages: object[][], files: Record<string, { filename?: string; description?: string }>, bodies: Record<string, Uint8Array>): PdfJs {
  const document = {
    numPages: pages.length,
    getPage: async (number: number) => ({ getAnnotations: async () => pages[number - 1], cleanup: () => {} }),
    getAttachments: async () => new Map(Object.entries(files)),
    getAttachmentContent: async (id: string) => bodies[id] ?? null,
  };
  return { getDocument: () => ({ promise: Promise.resolve(document) as never, destroy: async () => {} }) };
}

const ascii = (text: string) => new TextEncoder().encode(text);

describe("readPdfForms", () => {
  it("reads each field once by the name a viewer shows, and the files with a text body", async () => {
    const forms = await readPdfForms(
      pdfjs(
        [
          [
            { subtype: "Widget", fieldName: "name", alternativeText: " Full name ", fieldValue: "Ada" },
            { subtype: "Widget", fieldName: "agree", checkBox: true, fieldValue: "Yes", exportValue: "Yes" },
            { subtype: "Widget", fieldName: "spam", checkBox: true, fieldValue: "Off", exportValue: "Yes" },
            { subtype: "Widget", fieldName: "size", radioButton: true, fieldValue: "M", buttonValue: "S" },
            { subtype: "Widget", fieldName: "size", radioButton: true, fieldValue: "M", buttonValue: "M" },
            { subtype: "Widget", fieldName: "pick", fieldValue: ["a", "b"] },
            { subtype: "Widget", fieldName: "send", pushButton: true },
            { subtype: "Widget", fieldName: "secret", hidden: true, fieldValue: "x" },
            { subtype: "FileAttachment", file: { filename: "note.txt", description: "A note" }, fileId: "a1" },
          ],
          [],
        ],
        { "data.bin": { description: "Raw" } },
        { a1: ascii("Hello"), "data.bin": new Uint8Array([0, 1, 2, 0, 255, 0, 0, 7]) },
      ),
      new Uint8Array(),
    );
    expect(forms.pages.get(1)).toEqual({
      fields: [
        { name: "Full name", value: "Ada" },
        { name: "agree", value: true },
        { name: "spam", value: false },
        { name: "size", value: "M" },
        { name: "pick", value: "a, b" },
      ],
      attachments: [{ name: "note.txt", description: "A note", text: "Hello" }],
    });
    expect(forms.pages.has(2)).toBe(false);
    expect(forms.files).toEqual([{ name: "data.bin", description: "Raw" }]);
    expect(withPdfForms([{ number: 2, text: "Two" }], forms)).toEqual([{ number: 2, text: "Two" }]);
  });
});
