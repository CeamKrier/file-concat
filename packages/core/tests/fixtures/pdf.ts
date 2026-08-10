/**
 * Hand-built PDFs. There is no PDF writer in the tree and committing binary
 * fixtures would hide what makes each one interesting, so these assemble the
 * bytes directly — same approach as the zip/tar fixtures next door.
 *
 * The distinction the extraction tests turn on is the **text layer**: a PDF
 * produced by a word processor stores real character codes, while a scanner
 * stores a picture of a page and nothing else. Only the first can be read
 * without OCR, and telling them apart is the whole reason `extract_failed`
 * exists as a counter.
 */

const enc = new TextEncoder();
const ascii = (s: string) => enc.encode(s);

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Wrap object bodies (numbered 1..n in the order given) into a complete file
 * with a cross-reference table.
 *
 * The xref offsets have to be byte-exact and every entry is exactly 20 bytes —
 * a table that is off by one is the classic way a hand-written PDF parses in
 * one reader and fails in another. Building the offsets while emitting is the
 * only way to keep them honest.
 */
function assemblePdf(bodies: readonly Uint8Array[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  push(ascii("%PDF-1.4\n"));
  bodies.forEach((body, index) => {
    offsets.push(offset);
    push(ascii(`${index + 1} 0 obj\n`));
    push(body);
    push(ascii("\nendobj\n"));
  });

  const xrefAt = offset;
  const entries = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
  ];
  push(ascii(`xref\n0 ${bodies.length + 1}\n${entries.join("")}`));
  push(ascii(`trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));

  return concat(chunks);
}

function stream(dict: string, body: Uint8Array): Uint8Array {
  return concat([
    ascii(`<< ${dict} /Length ${body.length} >>\nstream\n`),
    body,
    ascii("\nendstream"),
  ]);
}

/** Escape the three characters that are structural inside a PDF literal string. */
const pdfString = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * A PDF carrying a real text layer: one page per outer entry, one drawn line
 * per inner entry. Helvetica is one of the 14 standard fonts every reader
 * ships, so nothing has to be embedded and the file stays small.
 *
 * Object layout is 1 catalog, 2 pages, 3 font, then a page and a content
 * stream per page — `/Kids` has to name them, which is why the numbering is
 * computed rather than written out.
 */
export function textLayerPdfPages(pages: readonly (readonly string[])[]): Uint8Array {
  const firstPageObj = 4;
  const pageObjNumbers = pages.map((_, i) => firstPageObj + i * 2);

  const objects: Uint8Array[] = [
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii(
      `<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(" ")}] ` +
        `/Count ${pages.length} >>`,
    ),
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];

  pages.forEach((lines, i) => {
    const contentObj = pageObjNumbers[i] + 1;
    objects.push(
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`,
      ),
    );
    objects.push(
      stream(
        "",
        ascii(
          lines
            .map((line, n) => `BT /F1 18 Tf 72 ${720 - n * 28} Td (${pdfString(line)}) Tj ET`)
            .join("\n"),
        ),
      ),
    );
  });

  return assemblePdf(objects);
}

/** The single-page case, which is what most tests want. */
export function textLayerPdf(lines: readonly string[]): Uint8Array {
  return textLayerPdfPages([lines]);
}

/**
 * A PDF whose page is nothing but a picture — the shape a scanner produces.
 * There is no `/Font` anywhere, so there is no text to read however hard a
 * parser tries; the only route to its content is OCR over the pixels.
 *
 * The raster itself is a checkerboard rather than a solid fill: a degenerate
 * single-colour image is the kind of thing a decoder is entitled to optimise
 * away, and the fixture is only useful while it survives to the other side.
 */
export function imageOnlyPdf(size = 8): Uint8Array {
  const raster = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raster[y * size + x] = (x + y) % 2 === 0 ? 0x00 : 0xff;
  }

  return assemblePdf([
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    ascii(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ),
    // Scale the unit image square up to the full page, the way a scan is placed.
    stream("", ascii("q 612 0 0 792 0 0 cm /Im1 Do Q")),
    stream(
      `/Type /XObject /Subtype /Image /Width ${size} /Height ${size} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8`,
      raster,
    ),
  ]);
}
