import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { prepareBatch } from "~/lib/prepare-batch-client";

/**
 * A Word package shaped the way some writers shape one: relationships first,
 * then a stored thumbnail larger than the router's sniff window, and the
 * content-types part last. On its first 8 KB this is a plain zip.
 */
function thumbnailFirstDocx(): Uint8Array {
  const thumb = new Uint8Array(20_000);
  for (let i = 0; i < thumb.length; i++) thumb[i] = (i * 7919) & 0xff;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  return zipSync(
    {
      "_rels/.rels": strToU8(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
      "docProps/thumbnail.jpeg": thumb,
      "word/document.xml": strToU8(
        `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>`,
      ),
      "[Content_Types].xml": strToU8(
        `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      ),
    },
    { level: 0 },
  );
}

/** A File whose bytes refuse to be read, the way a moved or blocked file does. */
function unreadable(name: string): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "slice", {
    value: () => ({
      arrayBuffer: () => Promise.reject(new DOMException("nope", "NotReadableError")),
    }),
  });
  return file;
}

describe("prepareBatch", () => {
  it("keeps the batch when one file's bytes can't be read", async () => {
    const { files } = await prepareBatch([
      { file: unreadable("broken.ts"), path: "src/broken.ts" },
      { file: new File(["hello"], "ok.ts"), path: "src/ok.ts" },
    ]);

    expect(files.map((f) => f.path)).toEqual(["src/broken.ts", "src/ok.ts"]);
  });

  it("keeps an Office package whole when its prefix looks like a plain zip", async () => {
    const bytes = thumbnailFirstDocx();
    const { files, expandedCount } = await prepareBatch([
      { file: new File([bytes], "report.docx"), path: "report.docx" },
    ]);

    // One document routed to extraction, not four parts in a folder.
    expect(expandedCount).toBe(0);
    expect(files.map((f) => f.path)).toEqual(["report.docx"]);
    expect(files[0]!.route).toEqual({ kind: "extract", parserId: "office", format: "docx" });
  });

  it("carries the classification it sniffed, so the read loop never reads the prefix twice", async () => {
    // Measured 2026-09-15: a file the router leaves as `unknown` cost two 8 KB
    // reads (router, then validation) at about 2.7 ms each for a binary that
    // never reaches the bundle. The prefix is read once and both answers ride
    // on it; a file whose bytes refuse to be read carries nothing and the
    // read loop tries again on its own.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0)]);
    const pyc = new Uint8Array([0xcb, 0x0d, 0x0d, 0x0a, ...Array.from({ length: 512 }, (_, i) => (i * 7919 + 13) & 0xff)]);
    const { files } = await prepareBatch([
      { file: new File(["export const a = 1;\n"], "a.ts"), path: "a.ts" },
      { file: new File([pyc], "m.pyc"), path: "__pycache__/m.pyc" },
      { file: new File([png], "logo.png"), path: "logo.png" },
      { file: unreadable("gone.ts"), path: "gone.ts" },
    ]);
    expect(files.map((f) => [f.path, f.route.kind, f.sniffed])).toEqual([
      ["a.ts", "unknown", "text"],
      ["__pycache__/m.pyc", "unknown", "binary"],
      ["logo.png", "binary", "binary"],
      ["gone.ts", "unknown", undefined],
    ]);
  });

  it("turns away inside an archive what the door turns away beside it", async () => {
    // A zipped build tree used to be read in full while the unzipped one next
    // to it was pruned: the door ran on the drop, never on what the archives
    // in it held. The archive stands as the root now, so its own name is
    // exempt and its contents are judged like loose files.
    const zip = zipSync({
      "src/index.ts": strToU8("export {};\n"),
      "fonts/Inter.woff2": strToU8("wOF2"),
      "node_modules/dep/index.js": strToU8("module.exports = 1;\n"),
      "icon/16.png": strToU8("png"),
    });
    const { files, expandedCount, pruned } = await prepareBatch([
      { file: new File([zip], "dist.zip"), path: "dist.zip" },
    ]);

    expect(expandedCount).toBe(1);
    // `dist` is the archive's own name and reads; the image is offered, not pruned.
    expect(files.map((f) => f.path).sort()).toEqual(["dist/icon/16.png", "dist/src/index.ts"]);
    // No root reported: `dist` is the archive's stem, not something anyone dropped.
    expect(pruned).toEqual({
      dirs: ["node_modules"],
      exts: new Map([["woff2", { n: 1 }]]),
      count: 2,
      roots: [],
    });
  });

  it("reports no prune for an archive that holds nothing on the list", async () => {
    const zip = zipSync({ "notes.md": strToU8("# Notes\n") });
    const { pruned } = await prepareBatch([{ file: new File([zip], "notes.zip"), path: "notes.zip" }]);
    expect(pruned).toBeNull();
  });

  it("reports progress as it routes", async () => {
    const seen: [number, number][] = [];
    await prepareBatch(
      [1, 2, 3].map((n) => ({ file: new File(["x"], `${n}.ts`), path: `${n}.ts` })),
      (done, total) => seen.push([done, total]),
    );

    expect(seen).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });
});
