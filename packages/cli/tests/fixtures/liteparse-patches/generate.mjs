// Writes a page per patch in vendor/liteparse-wasm that upstream
// @llamaindex/liteparse-wasm 2.17.0 reads differently from the patched build
// (checked by hand against the npm package, 2026-10-31). tests/probes.test.ts
// holds their output to the snapshot, so a re-port that drops one fails there.
// Standard Helvetica only: no font to embed.
//
// Only rule-touch has a page. prose-veto, split-words and span-text came from
// real pages and five synthetic tries read the same under both builds; their
// guard is the real-corpus scan in vendor/liteparse-wasm/README.md.
//
// usage, from packages/cli: node tests/fixtures/liteparse-patches/generate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/** A one-page PDF: `text` as [x, y, string, size?], `rules` as [x1, y1, x2, y2]. */
function pdf(text, rules = []) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const body = [
    ...rules.map(([x1, y1, x2, y2]) => `${x1} ${y1} m ${x2} ${y2} l S`),
    ...text.map(([x, y, s, size = 10]) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const PAGES = {};

// rule-touch: wrapped cell text that starts 0.4pt left of the column rule it sits behind.
{
  const xs = [72, 200, 540];
  const t = [];
  const rules = [];
  const rows = [
    ["Item", ["Description"]],
    ["Pump", ["Moves water from the lower tank", "to the roof reservoir every night", "when power is cheapest."]],
    ["Valve", ["Closes the return line whenever", "the reservoir reports it is full."]],
    ["Gauge", ["Shows the reservoir level on", "the panel beside the door."]],
  ];
  let top = 700;
  rules.push([xs[0], top, xs[2], top]);
  for (const [label, lines] of rows) {
    const h = 14 * lines.length + 8;
    t.push([xs[0] + 4, top - 14, label]);
    lines.forEach((l, i) => t.push([xs[1] - 0.4, top - 14 - 14 * i, l]));
    top -= h;
    rules.push([xs[0], top, xs[2], top]);
  }
  for (const x of xs) rules.push([x, 700, x, top]);
  PAGES["rule-touch"] = pdf(t, rules);
}

for (const [name, bytes] of Object.entries(PAGES)) fs.writeFileSync(path.join(DIR, `${name}.pdf`), bytes);
