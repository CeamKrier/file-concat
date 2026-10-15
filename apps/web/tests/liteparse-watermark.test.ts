import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as lite from "@llamaindex/liteparse-wasm";
import { parsePdfPages } from "~/lib/liteparse-pages";

/** A one-page PDF drawing `content` in Helvetica. */
function pdf(content: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.7\n";
  const offsets = objects.map((object, index) => {
    const at = out.length;
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("parsePdfPages over liteparse", () => {
  it("keeps every body line on a page under a diagonal watermark", async () => {
    lite.initSync({ module: readFileSync(createRequire(import.meta.url).resolve("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm")) });
    const lines = Array.from({ length: 45 }, (_, i) => `BT /F1 11 Tf 72 ${720 - i * 14} Td (Line${i} of the body text) Tj ET`);
    // Without skipDiagonalText, liteparse dropped Line14 here (2026-10-15).
    const watermark = "q 0.85 g BT /F1 96 Tf 0.7071 0.7071 -0.7071 0.7071 150 250 Tm (DRAFT) Tj ET Q";
    const { pages } = await parsePdfPages(lite.LiteParse, pdf([...lines, watermark].join("\n")));

    for (let i = 0; i < 45; i++) expect(pages[0].text).toContain(`Line${i} `);
  });
});
