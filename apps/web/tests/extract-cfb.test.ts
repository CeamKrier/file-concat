import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractCfb } from "~/lib/extract-cfb-client";

/** A BIFF8 workbook, written by the same library that reads it. */
function biff8(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { bookType: "xls", type: "array" }));
}

/** A compound file whose streams say Word, not Excel. */
function wordContainer(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(container, "/WordDocument", new Uint8Array(64));
  XLSX.CFB.utils.cfb_add(container, "/1Table", new Uint8Array(16));
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

describe("extractCfb", () => {
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

  it("answers a compound file that holds no workbook with parser-unavailable, not a throw", () => {
    // A .doc, .ppt or .msg shares the signature; the ledger names it from
    // there, under its own extension, exactly as a build with no reader would.
    expect(extractCfb(wordContainer())).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("reports a workbook with no cells as empty, never as its sheet headings", () => {
    expect(extractCfb(biff8({ Blank: [] })).text).toBe("");
  });
});
