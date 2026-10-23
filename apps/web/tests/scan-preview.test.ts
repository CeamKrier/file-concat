import { describe, expect, it } from "vitest";
import type { ScannedDocument } from "~/hooks/use-file-ingestion";
import { PREVIEW_MAX_BYTES, planPreview } from "~/lib/scan-preview";

/** A document of `pages` pages; the size is set without allocating it. */
function doc(path: string, pages: number, extra: Partial<ScannedDocument> = {}, size = 1024): ScannedDocument {
  const file = new File(["x"], path);
  Object.defineProperty(file, "size", { value: size });
  return { path, format: "pdf", file, pages: Array.from({ length: pages }, (_, i) => i + 1), ...extra };
}

describe("planPreview", () => {
  it("spends six pages, three per document, in drop order", () => {
    const { read, skipped } = planPreview([doc("a.pdf", 40), doc("b.pdf", 2), doc("c.pdf", 40), doc("d.pdf", 40)]);

    expect(read.map(({ document, first }) => [document.path, first])).toEqual([
      ["a.pdf", [1, 2, 3]],
      ["b.pdf", [1, 2]],
      ["c.pdf", [1]],
    ]);
    expect(skipped.map(({ document, reason }) => [document.path, reason])).toEqual([["d.pdf", "budget"]]);
  });

  it("never opens a document too big to hold unasked", () => {
    const { read, skipped } = planPreview([doc("huge.pdf", 400, {}, PREVIEW_MAX_BYTES + 1), doc("a.pdf", 5)]);

    expect(read.map(({ document }) => document.path)).toEqual(["a.pdf"]);
    expect(skipped).toMatchObject([{ reason: "size" }]);
  });

  it("leaves alone what is not a whole scan with its pages listed", () => {
    const { read, skipped } = planPreview([
      doc("part.pdf", 5, { text: "# Page 1\nread" }),
      doc("officeparser.pdf", 0, { pages: undefined }),
      doc("slides.pptx", 5, { format: "pptx" }),
    ]);

    expect(read).toEqual([]);
    expect(skipped.map(({ reason }) => reason)).toEqual(["shape", "shape", "shape"]);
  });
});
