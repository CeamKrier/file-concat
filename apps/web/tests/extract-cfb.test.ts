import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractCfb } from "~/lib/extract-cfb-client";
import { wordStreams } from "../../../packages/core/tests/fixtures/word";

/** A BIFF8 workbook, written by the same library that reads it. */
function biff8(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { bookType: "xls", type: "array" }));
}

/** A Word 97 document with one paragraph, in its container. */
function wordContainer(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  for (const [name, bytes] of wordStreams([{ text: "Minutes of the meeting.\r" }], { body: 24 })) {
    XLSX.CFB.utils.cfb_add(container, `/${name}`, bytes);
  }
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

/** A compound file whose streams say PowerPoint, which nothing here reads. */
function deckContainer(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(container, "/PowerPoint Document", new Uint8Array(64));
  XLSX.CFB.utils.cfb_add(container, "/Current User", new Uint8Array(16));
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};

/** An Outlook message: MAPI property streams in a compound file (MS-OXMSG). */
function outlookMessage(): Uint8Array {
  const container = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(container, "/__properties_version1.0", new Uint8Array(32));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0037001F", utf16("Quarterly numbers"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_1000001F", utf16("Numbers are attached."));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0C1A001F", utf16("Alice Example"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_5D01001F", utf16("alice@example.com"));
  XLSX.CFB.utils.cfb_add(container, "/__substg1.0_0E04001F", utf16("Bob"));
  XLSX.CFB.utils.cfb_add(container, "/__attach_version1.0_#00000000/__properties_version1.0", new Uint8Array(8));
  XLSX.CFB.utils.cfb_add(container, "/__attach_version1.0_#00000000/__substg1.0_3707001F", utf16("q3.pdf"));
  return new Uint8Array(XLSX.CFB.write(container, { type: "array" }));
}

describe("extractCfb", () => {
  it("reads an Outlook message as the correspondence it is", () => {
    // Measured 2026-09-15 against ten real Outlook files as well (record in
    // docs/measurements); this fixture pins the container-to-streams seam.
    expect(extractCfb(outlookMessage())).toEqual({
      text: [
        "From: Alice Example <alice@example.com>",
        "To: Bob",
        "Subject: Quarterly numbers",
        "",
        "Numbers are attached.",
        "",
        "Attachments (1, not included): q3.pdf",
      ].join("\n"),
      notes: [{ kind: "attachments-skipped", count: 1 }],
    });
  });

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

  it("reads a Word 97-2003 document's text", () => {
    // Measured 2026-09-15 against fifteen real Word files (docs/measurements).
    expect(extractCfb(wordContainer())).toEqual({ text: "Minutes of the meeting." });
  });

  it("answers a compound file nothing here reads with parser-unavailable, not a throw", () => {
    // A .ppt shares the signature; the ledger names it from there, under its
    // own extension, exactly as a build with no reader would.
    expect(extractCfb(deckContainer())).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("reports a workbook with no cells as empty, never as its sheet headings", () => {
    expect(extractCfb(biff8({ Blank: [] })).text).toBe("");
  });
});
