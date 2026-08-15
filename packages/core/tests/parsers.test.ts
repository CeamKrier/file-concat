import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { createParserRegistry } from "../src/file-processing/parsers/registry";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import { minimalDocx, tableDocx, twoSheetXlsx, twoSlidePptx } from "./fixtures/containers";

describe("createParserRegistry", () => {
  it("runs the loader a platform registered", async () => {
    const registry = createParserRegistry({
      office: async () => ({ text: "from the loader" }),
    });
    expect(registry.has("office")).toBe(true);
    expect(await registry.extract("office", new Uint8Array())).toEqual({
      text: "from the loader",
    });
  });

  it("answers an unregistered parser with a note, not an exception", async () => {
    // A build without a reader surfaces "couldn't extract text" — the documented
    // behaviour for a format it does not carry, not a crash and not a silent
    // reclassification (ADR-0011, ADR-0012).
    const registry = createParserRegistry({});
    expect(registry.has("epub")).toBe(false);
    expect(await registry.extract("epub", new Uint8Array([1, 2, 3]))).toEqual({
      text: "",
      notes: [{ kind: "parser-unavailable" }],
    });
  });

  it("keeps platforms independent — one map's absence is not another's", async () => {
    const web = createParserRegistry({ office: async () => ({ text: "web" }) });
    const cli = createParserRegistry({});
    expect(web.has("office")).toBe(true);
    expect(cli.has("office")).toBe(false);
  });
});

describe("extractOfficeDocument", () => {
  it("extracts the text from a docx", async () => {
    const { text } = await extractOfficeDocument(minimalDocx("Hello extractable document"));
    expect(text).toContain("Hello extractable document");
  });

  it("returns empty text when the document carries none", async () => {
    const { text } = await extractOfficeDocument(minimalDocx(""));
    expect(text).toBe("");
  });

  it("extracts the prose from an rtf, not its markup", async () => {
    const rtf =
      `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\n` +
      `\\f0\\fs24 Hello from RTF. \\par\n` +
      `Second paragraph with \\b bold\\b0  text.\\par\n}`;
    const { text } = await extractOfficeDocument(strToU8(rtf));
    expect(text).toContain("Hello from RTF.");
    expect(text).toContain("bold");
    expect(text).not.toContain("\\rtf1");
    expect(text).not.toContain("fonttbl");
  });

  it("omits notes entirely when the document parsed cleanly", async () => {
    const result = await extractOfficeDocument(minimalDocx("clean"));
    expect(result.notes).toBeUndefined();
  });
});

/**
 * What reaches the bundle is what the model reads, so "we extracted something"
 * is not the bar — the structure has to survive. These are the two shapes that
 * behaved completely differently under the same renderer, which is why the
 * renderer is now chosen from the parsed tree.
 */
describe("extractOfficeDocument — structure survives extraction", () => {
  it("keeps a docx table's cells apart and its rows intact", async () => {
    const { text } = await extractOfficeDocument(tableDocx());

    expect(text).toContain("Quarterly Report");
    expect(text).toContain("Revenue by region, in thousands.");
    for (const row of [
      ["Region", "Q1", "Q2"],
      ["EMEA", "1200", "1350"],
      ["APAC", "980", "1105"],
    ]) {
      // One line per row, every cell on it, in column order.
      const line = text.split("\n").find((l) => l.includes(row[0]));
      expect(line, `no line carries ${row[0]}`).toBeDefined();
      let at = -1;
      for (const cell of row) {
        const next = line!.indexOf(cell, at + 1);
        expect(next, `${cell} missing or out of order in "${line}"`).toBeGreaterThan(at);
        at = next;
      }
    }
  });

  it("keeps a spreadsheet's cells apart", async () => {
    const { text } = await extractOfficeDocument(twoSheetXlsx());

    // The regression this exists for: the flat-text renderer wrote the row
    // `EMEA | 1200 | 1350` as `EMEA12001350`, where 1200 and 1350 can no longer
    // be told apart from each other or from a single number.
    expect(text).not.toMatch(/12001350/);
    expect(text).toMatch(/EMEA\D+1200\D+1350/);
    expect(text).toMatch(/APAC\D+980\D+1105/);
  });

  it("keeps a spreadsheet's sheets named and separate", async () => {
    const { text } = await extractOfficeDocument(twoSheetXlsx());

    // Without the names, two sheets arrive as one undivided block and nothing
    // says which numbers belong to which table.
    expect(text).toContain("Revenue");
    expect(text).toContain("Headcount");
    expect(text.indexOf("Revenue")).toBeLessThan(text.indexOf("Headcount"));
    expect(text.indexOf("APAC")).toBeLessThan(text.indexOf("Headcount"));
  });

  it("marks where each slide of a deck begins", async () => {
    const { text } = await extractOfficeDocument(twoSlidePptx());

    // Without a marker the last line of slide one and the title of slide two
    // are consecutive lines of prose, and a deck reads as one long list.
    expect(text).toContain("# Slide 1");
    expect(text).toContain("# Slide 2");
    expect(text.indexOf("# Slide 1")).toBeLessThan(text.indexOf("Roadmap"));
    expect(text.indexOf("Measure quality")).toBeLessThan(text.indexOf("# Slide 2"));
    expect(text.indexOf("# Slide 2")).toBeLessThan(text.indexOf("Risks"));
  });

  it("leaves a document that has no slides unmarked", async () => {
    const { text } = await extractOfficeDocument(tableDocx());
    expect(text).not.toContain("# Slide");
  });
});
