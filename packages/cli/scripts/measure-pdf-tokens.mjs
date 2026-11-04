/**
 * What a PDF costs a Claude conversation two ways: uploaded as a PDF document
 * block, and as the text FileConcat's web chain extracts from it.
 *
 * Both sides are counted by Anthropic's own token counting endpoint
 * (POST /v1/messages/count_tokens), which is free and counts under the
 * tokenizer of the model passed. A PDF block is billed as each page's
 * extracted text plus an image of the page, so the difference between the two
 * counts is what the page images cost. The one-message wrapper is counted once
 * and subtracted from both sides.
 *
 * The text side is the --dump output of run-corpus.sh, so it is exactly what
 * the web chain produced on the tree that ran it. Its first line is the dump
 * header ("--- name | reader | chars | notes: ..."): it is dropped from the
 * text and its notes field sorts each file into a group:
 *   text         the reader found a text layer on every page
 *   scanned      notes carry pages-scanned: some or all pages are images, and
 *                FileConcat offers recognition for them rather than text
 *   undecodable  notes carry text-undecodable: part of the text layer is a
 *                font without a usable character map
 * Page counts, and the pages that paint an embedded image, come from pdf.js, the
 * web app's PDF library.
 *
 * Usage (from the repo root, after run-corpus.sh over a corpus holding pdf/):
 *   node --env-file=<file with ANTHROPIC_API_KEY=...> packages/cli/scripts/measure-pdf-tokens.mjs \
 *     <corpus>/pdf <run-corpus out>/pdf apps/web/src/data/pdf-tokens.json [model]
 *
 * Writes the per-group summary and the per-file ratios the blog post reads.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [pdfDir, dumpDir, outPath, model = "claude-opus-5-5"] = process.argv.slice(2);
if (!outPath) {
  console.error("usage: measure-pdf-tokens.mjs <pdf dir> <dump dir> <out.json> [model]");
  process.exit(2);
}

const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const pdfjs = await import(pathToFileURL(webRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);

const client = new Anthropic({ maxRetries: 8 });
const count = (content) =>
  client.messages.countTokens({ model, messages: [{ role: "user", content }] }).then((r) => r.input_tokens);

// Page count, and how many pages paint an embedded raster image: the part of a
// page pasted text cannot carry. Vector drawings are not counted, so it is a floor.
async function pageInfo(bytes) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const paints = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject]);
    let imagePages = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList();
      if (ops.fnArray.some((fn) => paints.has(fn))) imagePages++;
    }
    return { pages: doc.numPages, imagePages };
  } catch {
    return { pages: null, imagePages: null };
  } finally {
    await task.destroy();
  }
}

const wrapper = await count(".");

async function measure(file) {
  const bytes = readFileSync(join(pdfDir, file));
  const dump = readFileSync(join(dumpDir, `${file}.out.txt`), "utf8");
  const header = dump.slice(0, dump.indexOf("\n"));
  const text = dump.slice(header.length + 1);
  const notes = header.split("notes:")[1]?.trim() ?? "";
  const row = {
    file,
    bytes: bytes.length,
    ...(await pageInfo(bytes)),
    group: notes.startsWith("pages-scanned") ? "scanned" : notes.startsWith("text-undecodable") ? "undecodable" : "text",
    chars: text.length,
  };
  try {
    row.pdf = (await count([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }])) - wrapper;
  } catch (e) {
    row.error = String(e?.error?.error?.message ?? e.message).slice(0, 160);
  }
  // The endpoint rejects a whitespace-only text block; an empty extraction costs nothing to paste.
  row.text = text.trim() ? (await count(text)) - wrapper : 0;
  return row;
}

const files = readdirSync(pdfDir).filter((f) => f.endsWith(".pdf")).sort();
const rows = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < files.length) rows.push(await measure(files[next++]));
  }),
);
rows.sort((a, b) => a.file.localeCompare(b.file));

const quantile = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
};
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function summarise(group) {
  const withText = group.filter((r) => r.text > 0);
  const ratios = withText.map((r) => r.pdf / r.text);
  const pdf = group.reduce((s, r) => s + r.pdf, 0);
  const text = group.reduce((s, r) => s + r.text, 0);
  const perPage = (f) => round(quantile(group.map((r) => f(r) / r.pages), 0.5), 0);
  return {
    files: group.length,
    filesWithImages: group.filter((r) => r.imagePages > 0).length,
    pagesWithImages: group.reduce((s, r) => s + r.imagePages, 0),
    filesWithoutText: group.length - withText.length,
    pages: group.reduce((s, r) => s + r.pages, 0),
    pagesMedian: quantile(group.map((r) => r.pages), 0.5),
    pdf,
    text,
    ratio: round(pdf / text),
    saved: round(1 - text / pdf, 4),
    ratioMedian: ratios.length ? round(quantile(ratios, 0.5)) : null,
    ratioP10: ratios.length ? round(quantile(ratios, 0.1)) : null,
    ratioP90: ratios.length ? round(quantile(ratios, 0.9)) : null,
    textCostsMore: ratios.filter((r) => r <= 1).length,
    pdfPerPage: perPage((r) => r.pdf),
    textPerPage: perPage((r) => r.text),
    imagePerPage: perPage((r) => r.pdf - r.text),
  };
}

const counted = rows.filter((r) => r.error === undefined && r.pages);
const byGroup = (g) => counted.filter((r) => r.group === g);
const text = byGroup("text");
const out = {
  measured: new Date().toISOString().slice(0, 10),
  model,
  endpoint: "POST /v1/messages/count_tokens",
  files: rows.length,
  rejected: rows.filter((r) => r.error !== undefined).map((r) => ({ file: r.file, error: r.error })),
  groups: {
    text: summarise(text),
    textUpTo100Pages: summarise(text.filter((r) => r.pages <= 100)),
    textOver100Pages: summarise(text.filter((r) => r.pages > 100)),
    scanned: summarise(byGroup("scanned")),
    undecodable: summarise(byGroup("undecodable")),
  },
  // Per text-layer file, PDF tokens over text tokens: the figure's rows.
  textRatios: text.map((r) => round(r.pdf / r.text)),
};
writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ wrapper, files: rows.length, rejected: out.rejected.length, text: out.groups.text }));
