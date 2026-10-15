import { describe, expect, it } from "vitest";
import { routeBytes } from "../src/file-processing/routing";
import {
  assemblePdfPages,
  extractOfficeDocument,
  isPasswordProtected,
  replacePages,
  resolveImagePlaceholders,
} from "../src/file-processing/parsers/officeparser";
import {
  imageOnlyPdf,
  nestedFormsPdf,
  positionedTablePdf,
  tableWithEmptyCellPdf,
  textLayerPdf,
  textLayerPdfPages,
  twoColumnPdf,
  undecodablePagePdf,
  undecodableTextPdf,
} from "./fixtures/pdf";

/**
 * PDF had no fixture until now, which left the format we see most often as the
 * only extractable one nothing exercised. These cover the two shapes that
 * behave completely differently behind the same extension — a text layer to
 * read, versus a picture of a page with nothing to read — and the seam where
 * OCR output has to be put back into the text.
 */

describe("PDF routing", () => {
  it("routes a PDF to the office parser from its leading bytes", async () => {
    // The router never looks at a filename (ADR-0011), so this also confirms the
    // fixtures are real PDFs rather than something only our own tests accept.
    expect(await routeBytes(textLayerPdf(["anything"]))).toEqual({
      kind: "extract",
      parserId: "office",
      format: "pdf",
    });
    expect(await routeBytes(imageOnlyPdf())).toEqual({
      kind: "extract",
      parserId: "office",
      format: "pdf",
    });
  });
});

describe("extractOfficeDocument — PDFs with a text layer", () => {
  it("extracts a line of text", async () => {
    const { text } = await extractOfficeDocument(textLayerPdf(["Hello from a real PDF"]));
    expect(text).toContain("Hello from a real PDF");
  });

  it("keeps every line, in the order they were drawn", async () => {
    const lines = ["First line", "Second line", "Third line"];
    const { text } = await extractOfficeDocument(textLayerPdf(lines));

    for (const line of lines) expect(text).toContain(line);
    expect(text.indexOf("First line")).toBeLessThan(text.indexOf("Second line"));
    expect(text.indexOf("Second line")).toBeLessThan(text.indexOf("Third line"));
  });

  it("keeps pages in order", async () => {
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([["Page one body"], ["Page two body"], ["Page three body"]]),
    );

    expect(text.indexOf("Page one body")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Page one body")).toBeLessThan(text.indexOf("Page two body"));
    expect(text.indexOf("Page two body")).toBeLessThan(text.indexOf("Page three body"));
  });

  it("reads characters that are structural inside a PDF string", async () => {
    // Parentheses delimit a PDF literal and a backslash escapes; an unescaped
    // one truncates the string or corrupts the file, and the failure looks like
    // a parser bug rather than a fixture bug.
    const { text } = await extractOfficeDocument(
      textLayerPdf(["Total (net) is 50% \\ pending"]),
    );
    expect(text).toContain("Total (net) is 50%");
  });

  it("returns no notes for a PDF that parsed cleanly", async () => {
    const result = await extractOfficeDocument(textLayerPdf(["clean"]));
    expect(result.notes).toBeUndefined();
  });

  it("marks where each page begins", async () => {
    // A PDF has no punctuation of its own, so the last line of one page and the
    // first of the next arrive as consecutive lines. Sheets and slides already
    // carry a boundary; pages carried none.
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([["Page one body"], ["Page two body"]]),
    );

    expect(text).toContain("# Page 1");
    expect(text).toContain("# Page 2");
    expect(text.indexOf("# Page 1")).toBeLessThan(text.indexOf("Page one body"));
    expect(text.indexOf("Page one body")).toBeLessThan(text.indexOf("# Page 2"));
    expect(text.indexOf("# Page 2")).toBeLessThan(text.indexOf("Page two body"));
  });

  it("still shows a page that yielded no text", async () => {
    // The document is not empty, so it never reaches the "no extractable text"
    // path, and before the marker nothing anywhere said a page had been lost.
    // A page with no drawn text stands in for the real case, a scanned one:
    // both parse to a page carrying nothing.
    const { text } = await extractOfficeDocument(textLayerPdfPages([["Page one body"], []]));

    expect(text).toContain("Page one body");
    expect(text).toContain("# Page 2");
  });
});

/**
 * Column order on a multi-column page. officeparser 7 ordered a page's glyphs
 * by vertical position alone, which merged the columns line by line, and a
 * local patch fixed it; since 8.0 the library orders columns itself (an XY-cut
 * over the page). These are the tripwire if that ever regresses.
 *
 * Measured 2026-08-15: officeparser 7.2.1 and 7.6.1 both merge these columns,
 * while `pypdf` on the identical bytes reads them correctly, so the ordering
 * was the defect rather than a limit of the format.
 */
describe("extractOfficeDocument — multi-column PDFs", () => {
  it("reads columns one after another, not line by line across the gutter", async () => {
    const { text } = await extractOfficeDocument(twoColumnPdf());

    const lastLeft = text.lastIndexOf("Left column line");
    const firstRight = text.indexOf("Right column line");
    expect(firstRight).toBeGreaterThan(-1);
    expect(lastLeft).toBeLessThan(firstRight);
  });

  it("keeps every line of both columns", async () => {
    const { text } = await extractOfficeDocument(twoColumnPdf());

    for (let row = 1; row <= 8; row++) {
      expect(text).toContain(`Left column line ${row} of eight`);
      expect(text).toContain(`Right column line ${row} of eight`);
    }
  });

  it("leaves a table drawn as positioned text reading across its rows", async () => {
    // officeparser 8 pads each column to its widest cell; the padding is layout.
    const text = (await extractOfficeDocument(positionedTablePdf())).text.replace(/ +/g, " ");

    // Reordered as columns this would read "Region EMEA APAC …", which is the
    // failure the width and fill guards exist to prevent.
    expect(text).toContain("| Region | Q1 | Q2 | Total |");
    expect(text).toContain("| EMEA | 1200 | 1350 | 2550 |");
    expect(text).toContain("| LATAM | 310 | 355 | 665 |");
  });
});

/**
 * A PDF has no cells, only glyphs at positions, so a table arrives as runs
 * separated by nothing but a wider gap, and an empty cell by nothing at all.
 * officeparser 8 recovers such a table as a table, and gives each cell the
 * column it sits in; the renderer writes only the cells there are, so the
 * slot an empty cell held is restored from that column.
 */
describe("extractOfficeDocument — tables drawn as positioned text", () => {
  it("reads a table with an empty cell as a table, keeping the empty cell's slot", async () => {
    const text = (await extractOfficeDocument(tableWithEmptyCellPdf())).text.replace(/ +/g, " ");

    expect(text).toContain("| EMEA | 1200 | 1350 | 2550 |");
    expect(text).toContain("| AMER | 1440 | 1510 | 2950 |");
    // The defect: "| APAC | 980 | 980 |", the total read as Q2 (pdf-1.2).
    expect(text).toContain("| APAC | 980 | | 980 |");
  });

  it("leaves prose alone", async () => {
    // The guard against the interesting failure: prose lines have gaps too, and
    // a pass that reads three of them as a table would put separators through
    // the middle of sentences.
    const { text } = await extractOfficeDocument(
      textLayerPdf([
        "A paragraph of ordinary prose that runs the width of the page.",
        "A second line of it, long enough to hold gaps of its own.",
        "A third, because three consecutive rows is what a table needs.",
      ]),
    );

    expect(text).not.toContain("|");
  });

  it("leaves a multi-column page alone", async () => {
    // Columns are ordered before this runs and never reach it, but the two
    // passes read the same geometry and a page can only be one of them.
    const { text } = await extractOfficeDocument(twoColumnPdf());

    expect(text).not.toContain("|");
  });
});

/**
 * Found on a real document 2026-08-16, which is the first real PDF this project
 * ever measured: a Turkish government e-document whose every font ships without
 * a `/ToUnicode` map. 89% of its extracted text came out as characters nobody
 * can read, and it reached the bundle looking like text. `pypdf` produced the
 * identical mess from the identical bytes.
 *
 * The corpus this suite grew from is all generated, and generated documents are
 * written by libraries that always write the map. Nothing in it fails this way.
 */
describe("extractOfficeDocument — text that cannot be decoded", () => {
  it("leaves out what could not be decoded and says how much", async () => {
    const { text, notes } = await extractOfficeDocument(undecodableTextPdf());

    expect(text).toContain("A line that decodes");
    // The whole point: what a model reads is only what a reader could vouch for.
    const control = [...text].some((ch) => ch.charCodeAt(0) < 0x20 && !"\t\n\r".includes(ch));
    expect(control).toBe(false);
    expect(notes).toEqual([{ kind: "text-undecodable", count: 1 }]);
  });

  it("answers empty when nothing at all decoded", async () => {
    // A page marker and nothing under it is the silent success ADR-0003 exists
    // to prevent, so a document that decoded nowhere is unreadable rather than
    // successfully empty.
    const { text, notes } = await extractOfficeDocument(undecodableTextPdf(false));

    expect(text).toBe("");
    expect(notes).toEqual([{ kind: "text-undecodable", count: 1, pages: [1] }]);
  });

  it("names the page that was lost and leaves the page that decoded alone", async () => {
    const { text, notes } = await extractOfficeDocument(undecodablePagePdf());

    // Only the broken page is named, so a re-read never touches page two's own
    // characters — the whole reason the note carries pages rather than a count.
    expect(notes).toEqual([{ kind: "text-undecodable", count: 1, pages: [1] }]);
    expect(text).toContain("The second page decodes");
    expect(text).toContain("# Page 2");
  });

  it("does not name a page that merely lost a line", async () => {
    // One line lost against one that read: the page still reads, and recognition
    // would trade the document's own characters for a near-miss of them.
    const { notes } = await extractOfficeDocument(undecodableTextPdf());

    expect(notes?.[0].pages).toBeUndefined();
  });
});

describe("replacePages", () => {
  const document = ["# Page 1", "lost to a font", "# Page 2", "ordinary prose"].join("\n");

  it("puts a re-read page back under its own marker", () => {
    const merged = replacePages(document, new Map([[1, "what recognition read"]]));

    expect(merged).toBe(
      ["# Page 1", "what recognition read", "# Page 2", "ordinary prose"].join("\n"),
    );
  });

  it("leaves a document alone when there is nothing to put back", () => {
    expect(replacePages(document, new Map())).toBe(document);
  });

  it("ignores a page the document does not have", () => {
    expect(replacePages(document, new Map([[7, "nowhere to go"]]))).toBe(document);
  });

  it("says nothing about a document that decoded", async () => {
    const { notes } = await extractOfficeDocument(textLayerPdf(["Ordinary readable prose"]));

    expect(notes).toBeUndefined();
  });
});

describe("assemblePdfPages", () => {
  const fence = "```text\n\n```";

  it("keeps the first copy of a running header and drops page-number footers", () => {
    // liteparse's own stripping drops every copy, title or marking included, so
    // the reader keeps them and the rule officeparser's PDFs get runs here.
    const pages = [1, 2, 3].map((number) => ({
      number,
      text: `Acme Report - CONFIDENTIAL\n\nBody ${number}.\n\nPage ${number} of 3`,
    }));
    const { text } = assemblePdfPages(pages);

    expect(text.match(/Acme Report - CONFIDENTIAL/g)).toHaveLength(1);
    expect(text.indexOf("Acme Report")).toBeLessThan(text.indexOf("Body 1."));
    expect(text).not.toMatch(/Page \d of 3/);
    for (const number of [1, 2, 3]) expect(text).toContain(`Body ${number}.`);
  });

  it("keeps one copy of a title that shares its line with the page number", () => {
    const pages = [1, 2, 3, 4].map((number) => ({
      number,
      text: `Body ${"ABCD"[number - 1]}.\n\nAnnual Report 2025 | Page ${number} of 4`,
    }));
    const { text } = assemblePdfPages(pages);

    expect(text.match(/Annual Report 2025/g)).toHaveLength(1);
    for (const letter of "ABCD") expect(text).toContain(`Body ${letter}.`);
  });

  it("drops printed page numbers that run out of step with the page index", () => {
    // A cover and a contents page push the printed number two behind the file's;
    // the running head names the chapter, which changes, so each name stays once.
    const heads = ["", "", "1 Introduction", "2 Introduction", "3 Methods", "4 Methods", "5 Methods"];
    const pages = heads.map((head, index) => ({ number: index + 1, text: `${head}\n\nBody ${"ABCDEFG"[index]}.`.trim() }));
    const { text } = assemblePdfPages(pages);

    expect(text.match(/Introduction/g)).toHaveLength(1);
    expect(text.match(/Methods/g)).toHaveLength(1);
    for (const letter of "ABCDEFG") expect(text).toContain(`Body ${letter}.`);
  });

  it("leaves numbered section headings that open each page", () => {
    const pages = [1, 2, 3].map((number) => ({ number, text: `Section ${number + 4}: Part\n\nBody ${"ABC"[number - 1]}.` }));
    const { text } = assemblePdfPages(pages);

    expect(text.match(/Section \d: Part/g)).toHaveLength(3);
  });

  it("leaves the edges of a two-page document alone", () => {
    const pages = [1, 2].map((number) => ({ number, text: `Acme Report\n\nBody ${number}.\n\nPage ${number} of 2` }));
    const { text } = assemblePdfPages(pages);

    expect(text.match(/Acme Report/g)).toHaveLength(2);
    expect(text.match(/Page \d of 2/g)).toHaveLength(2);
  });

  it("marks each page and names a scanned one for recognition", () => {
    const { text, notes } = assemblePdfPages([
      { number: 1, text: "Page one reads." },
      { number: 2, text: fence, scanned: true },
    ]);

    expect(text).toBe("# Page 1\nPage one reads.\n\n# Page 2");
    expect(notes).toEqual([{ kind: "pages-scanned", count: 1, pages: [2] }]);
    expect(replacePages(text, new Map([[2, "what recognition read"]]))).toBe(
      "# Page 1\nPage one reads.\n\n# Page 2\nwhat recognition read",
    );
  });

  it("names every page of a document no page of which reads, picture or not", () => {
    expect(assemblePdfPages([{ number: 1, text: fence, scanned: true }, { number: 2, text: "" }])).toEqual({
      text: "",
      notes: [{ kind: "pages-scanned", count: 2, pages: [1, 2] }],
    });
  });

  it("leaves a blank page without a picture alone", () => {
    const { notes } = assemblePdfPages([
      { number: 1, text: "Prose." },
      { number: 2, text: "" },
    ]);

    expect(notes).toBeUndefined();
  });

  it("drops undecodable lines and counts skipped pages", () => {
    const { text, notes } = assemblePdfPages(
      [
        { number: 1, text: "Readable." },
        { number: 2, text: "\u0003\u0004\u0005" },
      ],
      1,
    );

    expect(text).toBe("# Page 1\nReadable.\n\n# Page 2");
    expect(notes).toEqual([
      { kind: "pages-skipped", count: 1 },
      { kind: "text-undecodable", count: 1, pages: [2] },
    ]);
  });
});

describe("extractOfficeDocument — a PDF past the reader's budget", () => {
  it("says the rest was not read when pdf.js stops at its text budget", async () => {
    const { text, notes } = await extractOfficeDocument(nestedFormsPdf());
    expect(text).toContain("QZBEFORE");
    expect(text).not.toContain("QZAFTER");
    expect(notes).toContainEqual({ kind: "pages-skipped" });
  }, 30_000);
});

describe("extractOfficeDocument — scanned PDFs", () => {
  it("returns empty text for a page that is only an image", async () => {
    // This is the `extract_failed` case the counters record. Empty is the
    // contract: callers surface "no extractable text" rather than dropping the
    // file silently (ADR-0003). It also guards the page markers, which are ours
    // rather than the document's: emitted here they would answer `# Page 1` and
    // read as a successful extraction everywhere.
    const { text } = await extractOfficeDocument(imageOnlyPdf());
    expect(text).toBe("");
  });

  it("never leaks an image placeholder as if it were content", async () => {
    // Without OCR requested the library is not asked for attachments at all, so
    // no placeholder can appear. Asserted rather than assumed because a
    // non-empty `[Image: …]` would read as a successful extraction everywhere.
    const { text } = await extractOfficeDocument(imageOnlyPdf());
    expect(text).not.toContain("[Image:");
  });
});

/**
 * A paginated document repeats its title and a page number at every seam, so a
 * forty-page report writes eighty lines that belong to no sentence and cut the
 * ones that continue across a break. Both rules that thin this out are built so
 * that being wrong is cheap: a repeat is only ever dropped while an identical
 * copy stays, and a whole line is only dropped when it carries the page's own
 * number.
 */
describe("extractOfficeDocument — running headers and footers", () => {
  const page = (n: number, body: string) => ["Acme Quarterly Report", body, `${n}`];

  it("keeps one copy of a header that repeats on every page", async () => {
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([page(1, "Body one"), page(2, "Body two"), page(3, "Body three")]),
    );

    const lines = text.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "Acme Quarterly Report")).toHaveLength(1);
    // The copy that stays is the first, so nothing moves: the title still opens
    // the document it belongs to.
    expect(text.indexOf("Acme Quarterly Report")).toBeLessThan(text.indexOf("Body one"));
    for (const body of ["Body one", "Body two", "Body three"]) expect(text).toContain(body);
  });

  it("drops a footer that is the page's own number", async () => {
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([page(1, "Body one"), page(2, "Body two"), page(3, "Body three")]),
    );

    // `# Page n` says this already, and says it in the same words everywhere.
    const lines = text.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => /^\d+$/.test(line))).toHaveLength(0);
    expect(lines.filter((line) => line.startsWith("# Page "))).toHaveLength(3);
  });

  it("leaves a two-page document alone", async () => {
    // Two pages sharing an edge line is coincidence often enough to matter, and
    // four lines of furniture is not a problem worth a judgement call.
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([page(1, "Body one"), page(2, "Body two")]),
    );

    const lines = text.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "Acme Quarterly Report")).toHaveLength(2);
    expect(lines.filter((line) => /^\d+$/.test(line))).toHaveLength(2);
  });

  it("keeps figures that differ, however much they look alike", async () => {
    // The failure that would matter: three pages ending in the same words and
    // different numbers, thinned out as though they were one repeated line.
    // Nothing here is any page's own number, and none of the three is identical
    // to another, so all three have to survive.
    const { text } = await extractOfficeDocument(
      textLayerPdfPages([
        ["Ledger", "a", "Subtotal 1200"],
        ["Ledger", "b", "Subtotal 2550"],
        ["Ledger", "c", "Subtotal 3655"],
      ]),
    );

    for (const total of ["Subtotal 1200", "Subtotal 2550", "Subtotal 3655"]) {
      expect(text, `${total} was thinned out as furniture`).toContain(total);
    }
  });
});

/**
 * The library throws a bare `Error` for a locked document — no error code, no
 * `cause` — so the wording is the only thing to go on, and half of it comes
 * from pdf.js rather than officeparser. Verified against a real encrypted PDF
 * in the measurement corpus, which is generated and therefore cannot be a
 * fixture here; what these pin down is the mapping, not the throw.
 */
describe("isPasswordProtected", () => {
  it("recognises the wording a locked document fails with", () => {
    expect(isPasswordProtected(new Error("[OfficeParser]: No password given"))).toBe(true);
    expect(isPasswordProtected(new Error("[OfficeParser]: Incorrect password"))).toBe(true);
  });

  it("leaves every other failure alone", () => {
    // Nothing here is actionable by the person holding the file, which is the
    // whole distinction: telling them to unlock a corrupt file is worse than
    // saying nothing.
    expect(isPasswordProtected(new Error("[OfficeParser]: File is corrupted"))).toBe(false);
    expect(isPasswordProtected(new Error("ZIP_TRUNCATED"))).toBe(false);
    expect(isPasswordProtected("No password given")).toBe(false);
    expect(isPasswordProtected(undefined)).toBe(false);
  });
});

describe("resolveImagePlaceholders", () => {
  it("puts recognised text where its placeholder stood", () => {
    expect(
      resolveImagePlaceholders("[Image: p1.bmp]", [{ name: "p1.bmp", ocrText: "Invoice 4417" }]),
    ).toBe("Invoice 4417");
  });

  it("keeps reading order when only some pages were scanned", () => {
    const rendered = "Real text layer\n[Image: p2.bmp]\nMore real text";
    expect(
      resolveImagePlaceholders(rendered, [{ name: "p2.bmp", ocrText: "Scanned middle page" }]),
    ).toBe("Real text layer\nScanned middle page\nMore real text");
  });

  it("removes the placeholder when recognition found nothing", () => {
    // The whole point: an unreadable scan must stay indistinguishable from an
    // empty extraction, or the emptiness check every caller relies on breaks.
    expect(resolveImagePlaceholders("[Image: blank.bmp]", [{ name: "blank.bmp" }]).trim()).toBe(
      "",
    );
  });

  it("resolves several images independently", () => {
    expect(
      resolveImagePlaceholders("[Image: a.bmp]\n[Image: b.bmp]\n[Image: c.bmp]", [
        { name: "a.bmp", ocrText: "first" },
        { name: "b.bmp" },
        { name: "c.bmp", ocrText: "third" },
      ]),
    ).toBe("first\n\nthird");
  });

  it("leaves prose that merely looks like a placeholder alone", () => {
    // A document is allowed to contain the literal text `[Image: x.png]`, and a
    // regex over every bracketed thing would eat it.
    const prose = "The spec says to write [Image: diagram.png] in the alt field.";
    expect(resolveImagePlaceholders(prose, [{ name: "other.bmp", ocrText: "x" }])).toBe(prose);
  });

  it("trims the recogniser's trailing whitespace", () => {
    expect(
      resolveImagePlaceholders("[Image: p.bmp]", [{ name: "p.bmp", ocrText: "  text  \n\n" }]),
    ).toBe("text");
  });

  it("ignores an image the renderer gave no name", () => {
    const rendered = "[Image: p.bmp]";
    expect(resolveImagePlaceholders(rendered, [{ ocrText: "orphan" }])).toBe(rendered);
  });
});
