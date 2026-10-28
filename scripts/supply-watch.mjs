// What moved upstream of FileConcat since the last run: the readers we ship,
// the tools /benchmarks compares us with, and new browser-portable OCR and
// speech models on Hugging Face. Run as a step of the pulse reading:
//
//   node scripts/supply-watch.mjs
//
// Writes docs/supply-watch/<YYYY-MM-DD>.json (gitignored: the candidate list
// says where the product may go) and prints a digest. Keyless public APIs
// only, no dependencies.
//
// Every source records its own status line. A source that errored is a watch
// gone blind, not a quiet month, and the digest says so first. The script
// reports what it can read and decides nothing: an upgrade, a rerun of a
// rival's row or a model worth measuring is the owner's call.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs/supply-watch");
const today = new Date().toISOString().slice(0, 10);

// Discovery: models created in the last WINDOW_DAYS that reached FLOOR likes.
// The window is longer than the gap between runs so a model that collects
// its likes late is still caught; "new" means not reported by an earlier run.
const WINDOW_DAYS = 90;
const FLOOR = 50;
const MAX_PAGES = 20;

// The readers in apps/web whose new versions could change what a bundle says.
const READERS = [
  "tesseract.js",
  "pdfjs-dist",
  "@llamaindex/liteparse-wasm",
  "@firecrawl/anydoc-wasm",
  "@huggingface/transformers",
  "onnxruntime-web",
  "@mozilla/readability",
  "turndown",
  "postal-mime",
  "7z-wasm",
  "chardetng-wasm",
  "mediabunny",
  "mp4box",
];

// /benchmarks row name -> where its releases are published. A versioned row
// with no entry here is listed as unwatched, never dropped silently.
const RIVALS = {
  Tika: { maven: "org/apache/tika/tika-core" },
  markitdown: { pypi: "markitdown" },
  Marker: { pypi: "marker-pdf" },
  Trafilatura: { pypi: "trafilatura" },
  Chandra: { pypi: "chandra-ocr" },
  gitingest: { pypi: "gitingest" },
  Repomix: { npm: "repomix" },
  code2prompt: { github: "mufeedvh/code2prompt" },
  rg: { github: "BurntSushi/ripgrep" },
};

const DISCOVERY = [
  { area: "ocr", q: "filter=ocr" },
  { area: "ocr", q: "filter=document-parsing" },
  { area: "ocr", q: "pipeline_tag=image-to-text" },
  { area: "ocr", q: "pipeline_tag=image-text-to-text&search=ocr" },
  { area: "speech", q: "pipeline_tag=automatic-speech-recognition" },
];

// Weights we could ship to a browser and list in the notices. Anything else,
// a missing licence tag included, is ruled out: a licence with use limits
// (OpenRAIL, non-commercial, "other") needs terms we cannot take on. The tag
// is the uploader's claim; a candidate's model card is still read by hand.
const USABLE = /^(apache-2\.0|mit|bsd(-[23]-clause)?|isc|cc0-1\.0|cc-by-4\.0|unlicense|mpl-2\.0)$/;

const health = [];

async function get(url, accept) {
  const res = await fetch(url, {
    headers: { "user-agent": "fileconcat-supply-watch", ...(accept && { accept }) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function source(name, fn) {
  try {
    const value = await fn();
    health.push({ source: name, ok: true });
    return value;
  } catch (e) {
    health.push({ source: name, ok: false, error: String(e.message ?? e) });
    return null;
  }
}

const numeric = (v) => v.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
const newer = (a, b) => {
  const [x, y] = [numeric(a), numeric(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};
const stable = (v) => /^v?\d+(\.\d+)+$/.test(v);
const newest = (versions) => versions.filter(stable).map((v) => v.replace(/^v/, "")).reduce((a, b) => (newer(b, a) ? b : a));

const npmLatest = async (name) => (await (await get(`https://registry.npmjs.org/-/package/${name.replace("/", "%2F")}/dist-tags`)).json()).latest;
const pypiLatest = async (name) => (await (await get(`https://pypi.org/pypi/${name}/json`)).json()).info.version;
const mavenLatest = async (path) =>
  newest([...(await (await get(`https://repo1.maven.org/maven2/${path}/maven-metadata.xml`)).text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]));
const githubLatest = async (repo) =>
  newest([...(await (await get(`https://github.com/${repo}/tags.atom`)).text()).matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]));

const previous = (() => {
  if (!existsSync(OUT)) return null;
  const file = readdirSync(OUT).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${today}.json`).sort().pop();
  return file ? { file, ...JSON.parse(readFileSync(join(OUT, file), "utf8")) } : null;
})();

// Ours: the installed version against the registry's latest. The vendored
// liteparse build carries a -fc.N suffix over the upstream version.
const ours = [];
for (const name of READERS) {
  const installed = JSON.parse(readFileSync(join(root, "apps/web/node_modules", name, "package.json"), "utf8")).version;
  const latest = await source(`npm ${name}`, () => npmLatest(name));
  const base = installed.replace(/-fc\.\d+$/, "");
  ours.push({ name, installed, latest, behind: latest != null && newer(latest, base) });
}

// The speech models load from the hub's main branch, unpinned, so a push
// upstream changes what users download without a release of ours.
const speechSrc = readFileSync(join(root, "apps/web/src/lib/extract-speech-client.ts"), "utf8");
const models = [];
for (const [, id] of speechSrc.matchAll(/model: "([^"]+)"/g)) {
  const info = await source(`hf ${id}`, async () => (await get(`https://huggingface.co/api/models/${id}`)).json());
  const before = previous?.models?.find((m) => m.id === id);
  models.push({ id, sha: info?.sha ?? null, lastModified: info?.lastModified ?? null, changed: Boolean(info && before?.sha && before.sha !== info.sha) });
}

// Rivals: every versioned row on /benchmarks.
const benchmarks = JSON.parse(readFileSync(join(root, "apps/web/src/data/benchmarks.json"), "utf8"));
const rows = new Map();
for (const section of benchmarks.sections)
  for (const chart of section.charts)
    for (const { label } of chart.rows) {
      const m = label.match(/^(.+?) v?(\d+(?:\.\d+)+)\b/);
      if (m && m[1] !== "FileConcat") rows.set(m[1], m[2]);
    }
const rivals = [];
const unwatched = [];
for (const [name, measured] of rows) {
  const where = RIVALS[name];
  if (!where) {
    unwatched.push(`${name} ${measured}`);
    continue;
  }
  const [kind, id] = Object.entries(where)[0];
  const latest = await source(`${kind} ${id}`, () => ({ npm: npmLatest, pypi: pypiLatest, maven: mavenLatest, github: githubLatest })[kind](id));
  rivals.push({ name, measured, latest, behind: latest != null && newer(latest, measured) });
}

// Discovery, newest first, paged until the window ends.
const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
const seen = new Map();
const counts = {};
for (const { area, q } of DISCOVERY) {
  const expand = ["createdAt", "likes", "tags", "library_name"].map((f) => `expand[]=${f}`).join("&");
  let url = `https://huggingface.co/api/models?${q}&sort=createdAt&direction=-1&limit=1000&${expand}`;
  let pages = 0;
  let n = 0;
  await source(`hf ${q}`, async () => {
    while (url && pages < MAX_PAGES) {
      const res = await get(url);
      const batch = await res.json();
      pages++;
      for (const m of batch) {
        if (m.createdAt < since) {
          url = null;
          break;
        }
        n++;
        seen.set(m.id, { ...m, area });
      }
      if (url) url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    }
    if (url) throw new Error(`stopped after ${MAX_PAGES} pages, window not reached`);
  });
  counts[q] = n;
}
const portable = (m) => ["onnx", "transformers.js"].includes(m.library_name) || m.tags?.some((t) => t === "onnx" || t === "transformers.js");
const licence = (m) => m.tags?.find((t) => t.startsWith("license:"))?.slice(8) ?? null;
const reported = new Set([...(previous?.candidates ?? []), ...(previous?.ruled_out ?? [])].map((m) => m.id));
const over = [...seen.values()]
  .filter((m) => portable(m) && m.likes >= FLOOR)
  .sort((a, b) => b.likes - a.likes)
  .map((m) => ({ id: m.id, area: m.area, likes: m.likes, created: m.createdAt.slice(0, 10), licence: licence(m), new: !reported.has(m.id) }));
const areas = {};
for (const m of seen.values()) {
  const a = (areas[m.area] ??= { created: 0, portable: 0, portable_10_likes: 0 });
  a.created++;
  if (portable(m)) {
    a.portable++;
    if (m.likes >= 10) a.portable_10_likes++;
  }
}

const result = {
  date: today,
  previous: previous?.file ?? null,
  window_days: WINDOW_DAYS,
  floor_likes: FLOOR,
  health,
  ours,
  models,
  rivals,
  unwatched_rivals: unwatched,
  discovery: { counts, areas },
  candidates: over.filter((m) => m.licence && USABLE.test(m.licence)),
  ruled_out: over.filter((m) => !(m.licence && USABLE.test(m.licence))),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${today}.json`), `${JSON.stringify(result, null, 2)}\n`);

const blind = health.filter((h) => !h.ok);
const lines = [`supply-watch ${today} (previous: ${result.previous ?? "none, this run is the baseline"})`];
lines.push(blind.length ? `BLIND: ${blind.map((h) => `${h.source} (${h.error})`).join("; ")}` : `all ${health.length} sources answered`);
// "none" over a list whose sources failed would read as all clear.
const list = (items, hits, unchecked) => {
  const text = hits.join(", ") || "none";
  const n = items.filter(unchecked).length;
  return n ? `${text} (${n} of ${items.length} NOT CHECKED)` : text;
};
lines.push("ours behind: " + list(ours, ours.filter((o) => o.behind).map((o) => `${o.name} ${o.installed} -> ${o.latest}`), (o) => o.latest == null));
lines.push("speech models changed upstream: " + list(models, models.filter((m) => m.changed).map((m) => `${m.id} (${m.lastModified})`), (m) => m.sha == null));
lines.push("rivals behind on /benchmarks: " + list(rivals, rivals.filter((r) => r.behind).map((r) => `${r.name} ${r.measured} -> ${r.latest}`), (r) => r.latest == null));
const blindQueries = DISCOVERY.filter(({ q }) => blind.some((h) => h.source === `hf ${q}`)).length;
if (blindQueries) lines.push(`discovery: ${blindQueries} of ${DISCOVERY.length} queries NOT CHECKED, the counts and lists below are partial`);
lines.push(`rivals unwatched: ${unwatched.join(", ") || "none"}`);
for (const [area, a] of Object.entries(areas))
  lines.push(`${area}, last ${WINDOW_DAYS} days: ${a.created} models, ${a.portable} browser-portable, ${a.portable_10_likes} of those with 10+ likes`);
const show = (m) => `${m.id} (${m.area}, ${m.likes} likes, ${m.created}, ${m.licence ?? "no licence tag"})${m.new ? " NEW" : ""}`;
lines.push(`candidates, portable with ${FLOOR}+ likes and a usable licence: ${result.candidates.map(show).join("; ") || "none"}`);
lines.push(`ruled out by licence: ${result.ruled_out.map(show).join("; ") || "none"}`);
console.log(lines.join("\n"));
