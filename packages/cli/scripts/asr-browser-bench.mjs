/**
 * Speech-to-text timed where the product would run it: transformers.js's web
 * build in headless Chromium, on a page that is not cross-origin isolated (the
 * product's, so onnxruntime-web runs one wasm thread), audio decoded by the
 * page's own decodeAudioData. Writes extract-candidate's results shape, so
 * `score-asr.py` scores it, plus each model's transfer size from the network.
 *
 * Usage:
 *   node packages/cli/scripts/asr-browser-bench.mjs <corpus dir> <out.json> <model> <dtype json> [lang]
 *   e.g. ... asr-clean20 out.json onnx-community/whisper-base '{"encoder_model":"fp32","decoder_model_merged":"q4"}' english
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const [corpus, outPath, model, dtypeJson, language = ""] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..", "..");
const dist = path.join(here, "..", "node_modules", "@huggingface", "transformers", "dist");
const { chromium } = createRequire(path.join(repo, "apps", "web", "package.json"))("playwright-core");

const files = fs.readdirSync(corpus, { recursive: true, encoding: "utf8" }).filter((f) => /\.(flac|wav|mp3|mp4|webm|mkv)$/.test(f)).sort();
const page = `<!doctype html><meta charset="utf-8"><script type="module">
import { pipeline, env } from "/lib/transformers.min.js";
function quietCuts(audio) {
  const RATE = 16000, FRAME = 800, pieces = [];
  let start = 0;
  while (audio.length - start > 30 * RATE) {
    let best = start + 30 * RATE, quietest = Infinity;
    for (let at = start + 20 * RATE; at + FRAME <= start + 30 * RATE; at += FRAME) {
      let energy = 0;
      for (let i = at; i < at + FRAME; i++) energy += audio[i] * audio[i];
      if (energy < quietest) { quietest = energy; best = at + FRAME / 2; }
    }
    pieces.push(audio.subarray(start, best));
    start = best;
  }
  pieces.push(audio.subarray(start));
  return pieces;
}
window.bench = async (files, model, dtype, language) => {
  const t0 = performance.now();
  const asr = await pipeline("automatic-speech-recognition", model, { dtype, device: "wasm" });
  const loadMs = Math.round(performance.now() - t0);
  const results = [];
  for (const f of files) {
    const start = performance.now();
    try {
      const bytes = await (await fetch("/audio/" + f)).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 16000);
      const audio = (await ctx.decodeAudioData(bytes)).getChannelData(0);
      // Whisper is windowed by the pipeline; Moonshine gets extract-candidate's quiet cuts.
      const pieces = model.includes("whisper") ? [audio] : quietCuts(audio);
      const texts = [];
      for (const piece of pieces) texts.push((await asr(piece, { chunk_length_s: 30, stride_length_s: 5, ...(language ? { language, task: "transcribe" } : {}) })).text.trim());
      results.push({ fixture: f, text: texts.join(" ").trim(), error: null, ms: Math.round(performance.now() - start) });
    } catch (e) {
      results.push({ fixture: f, text: "", error: String(e), ms: Math.round(performance.now() - start) });
    }
  }
  return { loadMs, isolated: self.crossOriginIsolated, threads: env.backends.onnx.wasm.numThreads, results };
};
window.ready = true;
</script>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file;
  if (url === "/") return res.end(page);
  if (url.startsWith("/lib/")) file = path.join(dist, url.slice(5));
  else if (url.startsWith("/audio/")) file = path.join(corpus, url.slice(7));
  if (!file || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));

const exe = fs.readdirSync(path.join(process.env.HOME, ".cache", "ms-playwright")).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const browser = await chromium.launch({ executablePath: path.join(process.env.HOME, ".cache", "ms-playwright", exe, "chrome-linux64", "chrome"), args: ["--no-sandbox"] });
const tab = await browser.newPage();
// Bytes on the wire for everything not served by this script (model files, the
// wasm runtime if fetched from its CDN), as Chrome's network panel counts them.
let modelBytes = 0;
const cdp = await tab.context().newCDPSession(tab);
await cdp.send("Network.enable");
const urls = new Map();
cdp.on("Network.responseReceived", (e) => urls.set(e.requestId, e.response.url));
cdp.on("Network.loadingFinished", (e) => {
  const url = urls.get(e.requestId) ?? "";
  if (!url.includes("/audio/") && (!url.startsWith("http://localhost") || url.endsWith(".wasm"))) {
    modelBytes += e.encodedDataLength;
    if (e.encodedDataLength > 1 << 20) console.log(`  ${(e.encodedDataLength / 2 ** 20).toFixed(1)} MiB ${url.split("?")[0]}`);
  }
});
tab.on("console", (m) => m.type() === "error" && console.error("page:", m.text()));
tab.on("pageerror", (e) => console.error("pageerror:", e.message));
tab.on("requestfailed", (r) => console.error("failed:", r.url()));
await tab.goto(`http://localhost:${server.address().port}/`);
await tab.waitForFunction(() => window.ready);
const run = await tab.evaluate(([f, m, d, l]) => window.bench(f, m, d, l), [files, model, JSON.parse(dtypeJson), language]);
const reader = `browser ${model.split("/").pop()} ${dtypeJson}`;
fs.writeFileSync(outPath, JSON.stringify({ reader, corpus, loadMs: run.loadMs, isolated: run.isolated, threads: run.threads, transferMiB: +(modelBytes / 2 ** 20).toFixed(1), results: run.results }, null, 2));
console.log(`${reader}: load ${run.loadMs} ms, transfer ${(modelBytes / 2 ** 20).toFixed(1)} MiB, isolated ${run.isolated}, threads ${run.threads}, ${run.results.length} files`);
await browser.close();
server.close();
process.exit(0);
