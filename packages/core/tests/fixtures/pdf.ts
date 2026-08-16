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
 * A PDF whose text is placed at explicit coordinates, one entry per drawn run.
 *
 * A PDF has no notion of a column, a row or a cell: it holds glyphs at
 * positions, and every structure a reader recovers is inferred from geometry.
 * That is why the fixtures below are built from raw coordinates rather than
 * from a "table" or "column" helper that would beg the question.
 */
export function positionedTextPdf(
  runs: readonly { x: number; y: number; text: string; size?: number }[],
): Uint8Array {
  return assemblePdf([
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii("<< /Type /Pages /Kids [4 0 R] /Count 1 >>"),
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>`,
    ),
    stream(
      "",
      ascii(
        runs
          .map(
            (r) =>
              `BT /F1 ${r.size ?? 10} Tf ${r.x} ${r.y} Td (${pdfString(r.text)}) Tj ET`,
          )
          .join("\n"),
      ),
    ),
  ]);
}

/**
 * Two columns of prose, drawn the way a typesetter lays them out: the left and
 * right column share a `y` for every row.
 *
 * That shared `y` is the whole point. A reader that orders glyphs by vertical
 * position alone emits the left column's line and the right column's line as
 * one line, and does it for every row on the page, so the text comes out
 * spliced mid-sentence. The lines are long enough to fill their columns
 * because prose wraps at the column edge, which is one of the signals that
 * separates a column from a table.
 */
export function twoColumnPdf(): Uint8Array {
  const runs: { x: number; y: number; text: string }[] = [];
  for (let row = 0; row < 8; row++) {
    const y = 700 - row * 20;
    runs.push({ x: 72, y, text: `Left column line ${row + 1} of eight, filling it` });
    runs.push({ x: 340, y, text: `Right column line ${row + 1} of eight, filling it` });
  }
  return positionedTextPdf(runs);
}

/**
 * A table drawn as positioned text: four columns, sharing a `y` per row
 * exactly as the two-column page does.
 *
 * The counter-example the column detector has to survive. Geometrically this
 * page also has vertical gaps no text crosses, so a detector that looks only
 * for gutters reorders it and reads each column top to bottom, turning the
 * rows into nonsense. What separates it is shape: its columns are narrow and
 * unequal, and its cells are short values sitting in wide slots rather than
 * prose filling them.
 */
export function positionedTablePdf(): Uint8Array {
  const rows = [
    ["Region", "Q1", "Q2", "Total"],
    ["EMEA", "1200", "1350", "2550"],
    ["APAC", "980", "1010", "1990"],
    ["AMER", "1440", "1510", "2950"],
    ["LATAM", "310", "355", "665"],
    ["MEA", "220", "240", "460"],
  ];
  const columnX = [72, 260, 340, 420];
  const runs: { x: number; y: number; text: string }[] = [];
  rows.forEach((cells, row) => {
    const y = 700 - row * 20;
    cells.forEach((text, column) => runs.push({ x: columnX[column], y, text }));
  });
  return positionedTextPdf(runs);
}

/**
 * The same table with one cell left empty, which is the shape that makes the
 * loss invisible rather than merely awkward.
 *
 * A PDF draws nothing at all for an empty cell, so the row arrives as three
 * values where the source had four. Joined by a single space, `APAC 980 980`
 * reads as Q1 980, Q2 980, no total — every figure after the gap has moved one
 * column left and changed meaning, and nothing in the text says so.
 */
export function tableWithEmptyCellPdf(): Uint8Array {
  const rows = [
    ["Region", "Q1", "Q2", "Total"],
    ["EMEA", "1200", "1350", "2550"],
    ["APAC", "980", "", "980"],
    ["AMER", "1440", "1510", "2950"],
  ];
  const columnX = [72, 260, 340, 420];
  const runs: { x: number; y: number; text: string }[] = [];
  rows.forEach((cells, row) => {
    const y = 700 - row * 20;
    cells.forEach((text, column) => {
      if (text) runs.push({ x: columnX[column], y, text });
    });
  });
  return positionedTextPdf(runs);
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
