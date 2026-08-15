import { describe, expect, it } from "vitest";
import { routeBytes } from "../src/file-processing/routing";
import {
  extractOfficeDocument,
  isPasswordProtected,
  resolveImagePlaceholders,
} from "../src/file-processing/parsers/officeparser";
import {
  imageOnlyPdf,
  positionedTablePdf,
  textLayerPdf,
  textLayerPdfPages,
  twoColumnPdf,
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
 * These guard `patches/officeparser@7.6.1.patch`, which is the only thing
 * making them pass: the library orders a page's glyphs by vertical position
 * alone, which merges the columns of a multi-column page line by line. The
 * patch is re-applied by pnpm on install and will stop applying the moment
 * officeparser changes those files, so these tests are the tripwire that says
 * the fix is gone. If they fail after a dependency bump, the patch needs
 * re-deriving, not deleting.
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
    const { text } = await extractOfficeDocument(positionedTablePdf());

    // Reordered as columns this would read "Region EMEA APAC …", which is the
    // failure the width and fill guards exist to prevent.
    expect(text).toContain("Region Q1 Q2 Total");
    expect(text).toContain("EMEA 1200 1350 2550");
    expect(text).toContain("LATAM 310 355 665");
  });
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
