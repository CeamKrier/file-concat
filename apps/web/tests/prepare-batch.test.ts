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
