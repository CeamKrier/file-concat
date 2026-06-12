import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.join(HERE, "fixtures");

/**
 * Build a minimal valid single-page PDF whose content stream prints the given
 * text. Used to produce a deterministic, hand-rolled fixture (~600 bytes) so
 * the parse happy-path can be verified without shipping opaque binaries.
 */
export function buildMinimalPdf(text: string): Buffer {
  const objects: string[] = [];
  objects[1] = "<</Type/Catalog/Pages 2 0 R>>";
  objects[2] = "<</Type/Pages/Kids[3 0 R]/Count 1>>";
  objects[3] =
    "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 612 792]/Contents 5 0 R>>";
  objects[4] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";
  const escaped = text.replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\\/g, "\\\\");
  const streamContent = `BT /F1 24 Tf 100 700 Td (${escaped}) Tj ET`;
  objects[5] = `<</Length ${streamContent.length}>>\nstream\n${streamContent}\nendstream`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(body);
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(body);
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += offsets[i].toString().padStart(10, "0") + " 00000 n \n";
  }
  const trailer = `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, "binary");
}

/**
 * Write the deterministic PDF fixture into the parse-project directory.
 * Idempotent: overwrites whatever is there so the test sees the same bytes
 * every run.
 */
export function writePdfFixture(): string {
  const target = path.join(FIXTURES_DIR, "parse-project", "hello.pdf");
  fs.writeFileSync(target, buildMinimalPdf("Hello fileconcat"));
  return target;
}
