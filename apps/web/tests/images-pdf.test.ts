import { describe, expect, it } from "vitest";
import { layout, MAX_SIDE, planParts, writePdf } from "../src/lib/images-pdf-client";
import { imagesLeftOutOfPdf } from "~/components/app/empty-kind";

const jpeg = (size: number) => new Blob([new Uint8Array(size)]);

describe("writePdf", () => {
  it("writes a file the PDF reader opens, one page per image at its own size", async () => {
    const pdf = writePdf([
      { jpeg: jpeg(300), width: 924, height: 2032 },
      { jpeg: jpeg(70_000), width: 1440, height: 950 },
    ]);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
    const doc = await task.promise;
    expect(doc.numPages).toBe(2);
    const second = (await doc.getPage(2)).getViewport({ scale: 1 });
    expect([second.width, second.height]).toEqual([1440, 950]);
    await task.destroy();
  });

  it("points every cross-reference entry at its object", async () => {
    const bytes = Buffer.from(await writePdf([{ jpeg: jpeg(9), width: 10, height: 20 }]).arrayBuffer());
    const text = bytes.toString("latin1");
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((at, i) => expect(text.slice(at, at + 8)).toBe(`${i + 1} 0 obj\n`));
    expect(Number(/startxref\n(\d+)/.exec(text)?.[1])).toBe(text.indexOf("xref\n0 6"));
  });
});

describe("planParts", () => {
  it("closes a part at the page limit and at the byte limit", () => {
    const pages = Array.from({ length: 150 }, () => ({ jpeg: { size: 10 } }));
    expect(planParts(pages).map((p) => p.length)).toEqual([100, 50]);
    expect(planParts(pages.slice(0, 5), 100, 25).map((p) => p.length)).toEqual([2, 2, 1]);
    expect(planParts([])).toEqual([]);
  });
});

describe("layout", () => {
  it("caps the long edge and keeps a phone screenshot on one page", () => {
    expect(layout(1170, 2532)).toEqual({ width: 924, height: 2000, slices: [{ top: 0, height: 2000 }] });
    expect(layout(800, 600).slices).toHaveLength(1);
  });

  it("cuts a long scrolling capture into readable pages that cover it", () => {
    const { width, height, slices } = layout(1170, 12_000);
    expect(width).toBe(1170);
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.every((s) => s.height <= MAX_SIDE)).toBe(true);
    const last = slices[slices.length - 1];
    expect(last.top + last.height).toBe(height);
    slices.slice(1).forEach((s, i) => expect(s.top).toBeLessThan(slices[i].top + slices[i].height));
  });
});

it("names the photo formats the PDF cannot hold", () => {
  const paths = ["a/1.png", "a/IMG_2.HEIC", "a/3.avif", "notes.txt", "a/4.tiff"];
  expect(imagesLeftOutOfPdf(paths, new Set(["a/1.png", "a/4.tiff"]))).toEqual(["a/IMG_2.HEIC", "a/3.avif"]);
});
