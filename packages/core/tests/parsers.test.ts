import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { createParserRegistry } from "../src/file-processing/parsers/registry";
import { extractOfficeDocument } from "../src/file-processing/parsers/officeparser";
import {
  minimalDocx,
  referencesDocx,
  tableDocx,
  twoSheetXlsx,
  twoSlidePptx,
} from "./fixtures/containers";

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

  it("gives a merged header cell the columns it covers", async () => {
    const { text } = await extractOfficeDocument(tableDocx());

    // A row one cell wide inside a three-column table is not a table any more:
    // aligned by position, the heading becomes a value in the first column and
    // the other two columns lose their data.
    const rows = text.split("\n").filter((line) => line.startsWith("|"));
    expect(rows[0]).toContain("Half-year totals");
    const widths = new Set(rows.map((line) => line.split("|").length));
    expect([...widths], `rows of differing width:\n${rows.join("\n")}`).toHaveLength(1);
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

/**
 * A link's destination and a footnote's marker are both carried outside the
 * visible characters of a document, so losing them costs a reader nothing it
 * can see. That is what makes them worth a test: the output stays fluent and
 * plausible either way, and only an assertion tells the two apart.
 */
describe("extractOfficeDocument — references survive extraction", () => {
  it("writes a link's destination beside its anchor text", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    expect(text).toContain("our documentation (https://fileconcat.com/docs/introduction)");
  });

  it("does not repeat a destination that is already the visible text", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    const feed = "https://example.org/feed.json";
    expect(text).toContain(feed);
    expect(text.split(feed).length - 1, `"${feed}" written more than once`).toBe(1);
  });

  it("marks each footnote reference and labels the matching body", async () => {
    const { text } = await extractOfficeDocument(referencesDocx());

    // Both claims sit in one sentence, so without the markers nothing says
    // which of the two collected notes belongs to which claim.
    expect(text).toContain("Revenue rose 12 percent[^1]");
    expect(text).toContain("against a flat market[^2]");
    expect(text).toContain("[^1] Measured on 2026-08-15.");
    expect(text).toContain("[^2] Second note, on the same page.");
  });

  it("leaves a deck's speaker notes unnumbered", async () => {
    // Speaker notes are not references: they are rendered under their own
    // slide, so a marker beside one would point at nothing.
    const { text } = await extractOfficeDocument(twoSlidePptx());
    expect(text).not.toContain("[^");
  });
});
