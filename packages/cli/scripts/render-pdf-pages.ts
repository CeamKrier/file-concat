/**
 * Draw PDF pages to PNG the way the product does before recognition, so every
 * OCR candidate reads the same pixels the product's own would.
 *
 * Mirrors `readPdfPages` in `apps/web/src/lib/extract-document-client.ts`: the
 * web app's pdf.js, scale 2, an opaque white ground. Node has no DOM canvas, so
 * pdf.js draws into `@napi-rs/canvas`, the canvas pdf.js itself falls back to
 * under Node; the rasteriser differs from Chrome's, the input to every
 * candidate does not.
 *
 * Usage (one PDF path per line on stdin, relative to --root; page 1 of each):
 *   pnpm --filter @fileconcat/cli exec tsx scripts/render-pdf-pages.ts --root <dir> --out <dir> < list.txt
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// The web app's pdf.js, the one the product draws with.
const webRequire = createRequire(path.join(REPO_ROOT, "apps", "web", "package.json"));
const pdfjsPath = webRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = createRequire(pdfjsPath)("@napi-rs/canvas") as {
  createCanvas(width: number, height: number): {
    width: number;
    height: number;
    getContext(kind: "2d"): CanvasRenderingContext2D;
    encode(format: "png"): Promise<Buffer>;
  };
};

/**
 * pdf.js 6 decodes JBIG2 and JPEG 2000, the usual codecs of a scanned page,
 * with wasm it loads from `wasmUrl`. The product passes none (2026-10-03), so
 * `--no-wasm` reproduces it; the default draws what the page really holds.
 */
const WASM_URL = `${path.join(path.dirname(pdfjsPath), "..", "..", "wasm")}/`;

/** `readPdfPages`'s RENDER_SCALE. */
const RENDER_SCALE = 2;

const at = (p: string): string => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
const flag = (name: string): string => {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`${name} <dir> is required`);
  return at(process.argv[i + 1]);
};

async function main(): Promise<void> {
  const root = flag("--root");
  const out = flag("--out");
  const pdfjs = await import(pdfjsPath);
  const list = fs.readFileSync(0, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const rel of list) {
    const target = path.join(out, rel.replace(/\.pdf$/i, ".png"));
    if (fs.existsSync(target)) continue;
    const loading = pdfjs.getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(root, rel))),
      ...(process.argv.includes("--no-wasm") ? {} : { wasmUrl: WASM_URL }),
    });
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, await canvas.encode("png"));
    await loading.destroy();
    console.log(`${rel}: ${canvas.width}x${canvas.height}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
