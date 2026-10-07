/**
 * Run one candidate extractor over the extraction corpus and write its output
 * in the shape `measure-extraction-quality.ts` reads with `--reader`.
 *
 * Producing outputs and scoring them are kept apart, the way olmOCR-bench,
 * OmniDocBench and docling-eval do it: every candidate writes its text per
 * fixture, and one scorer runs the same CHECKS over all of them. A Python
 * reader (`extract-pdf-with-pypdf.py`) writes the same shape, so the scorer
 * never knows or cares what language a candidate is in.
 *
 * A candidate here is the library as it ships, called the way its README says.
 * None of core's visitors run on it, so a check that core fixes on top of the
 * baseline reader (heading levels, link targets, footnote labels) can read
 * BROKEN for a candidate whose tree carries the structure. That is the right
 * question for choosing a reader, and the wrong one for scoring the product.
 *
 * Usage:
 *   pnpm --filter @fileconcat/cli extract-candidate <name> [--out <file>] [--force]
 *   pnpm --filter @fileconcat/cli extract-candidate <name> --olmocr-bench <bench_data dir>
 *   pnpm --filter @fileconcat/cli extract-candidate <name> --corpus <dir> --out <file>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { type ChildProcess, fork } from "node:child_process";

import { createHash } from "node:crypto";

import { canExpandArchive, expandArchive, ROUTER_SNIFF_BYTES, routeBytes, stripArchiveSuffix } from "@fileconcat/core";

import { parsers } from "../src/parsers.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "packages", "core", "tests", "fixtures", "real");

interface Candidate {
  /** Fixture extensions the candidate claims to read. */
  formats: string[];
  extract: (bytes: Uint8Array) => Promise<string>;
}

/** officeparser 8 as shipped, with or without its layout-faithful text renderer. */
function officeparser8(config: Record<string, unknown>): Candidate {
  return {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf"],
    extract: async (bytes) => {
      const { parseOffice } = await import("officeparser8");
      const ast = await parseOffice(Buffer.from(bytes), config);
      const { value } = await ast.to("text");
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    },
  };
}

const require = createRequire(import.meta.url);

/** A wasm-bindgen web build initialised from its file, as Node has no fetch for it. */
function wasmFile(specifier: string): Buffer {
  return fs.readFileSync(require.resolve(specifier));
}

/** Load and initialise a module once, not once per file. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}

/**
 * Speech to text with transformers.js, the build a browser loads. Under Node it
 * runs on onnxruntime-node, so quality carries over to the browser and time does
 * not (native threads against single-threaded wasm). Audio is decoded to 16 kHz
 * mono float by ffmpeg here, by `decodeAudioData` in a browser. The language is
 * given from the corpus path, not detected: the upper bound for a reader that
 * would ask the visitor. Long audio goes in 30 s windows with 5 s strides, the
 * library's own long-form recipe.
 */
function asr(model: string, dtype: string | Record<string, string>, multilingual: boolean): Candidate {
  const pipe = once(async () => {
    const { pipeline } = await import("@huggingface/transformers");
    // ASR_THREADS=1 approximates the product's page, which is not cross-origin
    // isolated, so onnxruntime-web runs one wasm thread there.
    const threads = Number(process.env.ASR_THREADS) || undefined;
    const session_options = threads ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : undefined;
    return pipeline("automatic-speech-recognition", model, { dtype: dtype as "q8", device: "cpu", session_options });
  });
  return {
    formats: ["flac", "wav", "mp3", "m4a", "ogg", "opus", "webm", "mp4", "mkv", "mov"],
    extract: async (bytes) => {
      const { spawnSync } = await import("node:child_process");
      const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"], {
        input: bytes,
        maxBuffer: 1 << 30,
      });
      if (pcm.status !== 0) throw new Error(`ffmpeg: ${pcm.stderr.toString().slice(0, 200)}`);
      const audio = new Float32Array(pcm.stdout.buffer, pcm.stdout.byteOffset, pcm.stdout.byteLength / 4);
      const language = /tr_tr|-tr\.\w+$/.test(currentFile) ? "turkish" : "english";
      // ASR_AUTO_LANG=1 leaves the language to the model, as a page that does not ask would.
      const given = multilingual ? (process.env.ASR_AUTO_LANG ? { task: "transcribe" } : { language, task: "transcribe" }) : {};
      const options = { chunk_length_s: 30, stride_length_s: 5, ...given };
      // The pipeline windows long audio for Whisper only; Moonshine takes it whole
      // and runs out of memory on a 13-minute talk. Its own demos cut with a VAD;
      // here each piece ends at the quietest 50 ms between 20 and 30 s.
      const pieces = multilingual ? [audio] : quietCuts(audio);
      const texts: string[] = [];
      for (const piece of pieces) {
        const out = (await (await pipe())(piece, options)) as { text: string } | { text: string }[];
        texts.push((Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim());
      }
      return texts.join(" ").trim();
    },
  };
}

/** 16 kHz audio cut into pieces of at most 30 s, each cut at the quietest 50 ms frame between 20 and 30 s. */
function quietCuts(audio: Float32Array): Float32Array[] {
  const RATE = 16000, FRAME = 800;
  const pieces: Float32Array[] = [];
  let start = 0;
  while (audio.length - start > 30 * RATE) {
    let best = start + 30 * RATE, quietest = Infinity;
    for (let at = start + 20 * RATE; at + FRAME <= start + 30 * RATE; at += FRAME) {
      let energy = 0;
      for (let i = at; i < at + FRAME; i++) energy += audio[i] * audio[i];
      if (energy < quietest) [quietest, best] = [energy, at + FRAME / 2];
    }
    pieces.push(audio.subarray(start, best));
    start = best;
  }
  pieces.push(audio.subarray(start));
  return pieces;
}

const anydocModule = once(async () => {
  const anydoc = await import("@firecrawl/anydoc-wasm");
  anydoc.initSync({ module: wasmFile("@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm") });
  return anydoc;
});
const doclingModule = once(async () => {
  const docling = await import("docling.rs-wasm/web");
  docling.initSync({ module: wasmFile("docling.rs-wasm/web/docling_wasm_bg.wasm") });
  return docling;
});
const liteparseModule = once(async () => {
  const lite = await import("@llamaindex/liteparse-wasm");
  lite.initSync({ module: wasmFile("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm") });
  return lite;
});

/** Archive extensions; `.tar.gz` and friends end in their compressor's. */
const ARCHIVES = ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"];

/**
 * An archive reader's answer, as text so the runner treats it like any other:
 * every regular file with its size and digest, sorted by path. Directories,
 * links and devices are left out, as the answer key leaves them out.
 */
function listing(files: [string, Uint8Array][]): string {
  const rows = files.map(([p, b]) => ({ path: p, size: b.length, sha256: createHash("sha256").update(b).digest("hex") }));
  return JSON.stringify(rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}

const libarchiveModule = once(async () => (await import("libarchive-wasm")).libarchiveWasm());

/** Every regular file under a directory of 7-Zip's in-memory file system. */
function walk7z(fs7: { readdir(p: string): string[]; isDir(mode: number): boolean; stat(p: string): { mode: number }; readFile(p: string): Uint8Array }, dir: string, rel = ""): [string, Uint8Array][] {
  return fs7.readdir(dir).flatMap((name): [string, Uint8Array][] => {
    if (name === "." || name === "..") return [];
    const full = `${dir}/${name}`;
    return fs7.isDir(fs7.stat(full).mode) ? walk7z(fs7, full, `${rel}${name}/`) : [[`${rel}${name}`, fs7.readFile(full)]];
  });
}

/** One `7zz x` in a fresh module: emscripten's callMain runs once per instance. */
async function sevenZip(name: string, bytes: Uint8Array): Promise<[string, Uint8Array][]> {
  const { default: SevenZip } = await import("7z-wasm");
  const errors: string[] = [];
  const sz = await SevenZip({ print: () => {}, printErr: (line: string) => errors.push(line) });
  sz.FS.mkdir("/in");
  sz.FS.writeFile(`/in/${name}`, bytes);
  try {
    sz.callMain(["x", "-y", "-o/out", `/in/${name}`]);
  } catch (err) {
    errors.push(String(err));
  }
  let out: [string, Uint8Array][] = [];
  try {
    out = walk7z(sz.FS as never, "/out");
  } catch {
    // No /out: 7-Zip wrote nothing.
  }
  if (out.length === 0 && errors.length) throw new Error(errors.join(" ").slice(0, 300));
  return out;
}

/**
 * OCR candidates read page images (`render-pdf-pages.ts` draws them the way the
 * product does). tesseract.js is the product's reader, English here because
 * the benchmark is; PP-OCR runs through onnxruntime-node, the same models the
 * browser build would load through onnxruntime-web.
 */
const tesseractWorker = once(async () => (await import("tesseract.js")).createWorker("eng"));
function paddle(model: "V6_TINY_MODEL" | "V6_SMALL_MODEL" | "V6_MEDIUM_MODEL" | "V5_EN_MOBILE_MODEL"): Candidate {
  const service = once(async () => {
    const ocr = await import("ppu-paddle-ocr");
    const instance = new ocr.PaddleOcrService({ model: ocr[model] });
    await instance.initialize();
    return instance;
  });
  return {
    formats: ["png"],
    extract: async (bytes) => (await (await service()).recognize(bytes.slice().buffer)).text,
  };
}

/**
 * A video's own subtitle track, read without decoding anything: mp4box.js for
 * MP4/MOV (a tx3g sample is a 16-bit length and UTF-8 text), matroska-subtitles
 * for MKV/WebM. LangChain's YoutubeLoader takes the caption track first too.
 */
async function subtitleTrack(bytes: Uint8Array): Promise<string> {
  if (/\.(mkv|webm)$/i.test(currentName)) {
    const tracks = matroskaTextBlocks(bytes);
    if (!tracks.length) throw new Error("no subtitle track");
    return tracks.map((cues) => cues.join("\n")).join("\n\n");
  }
  return mp4TextSamples(bytes);
}

/**
 * Text blocks of a Matroska/WebM file's subtitle tracks (TrackType 0x11): the
 * spec's EBML walk over Segment, Tracks and Clusters, nothing decoded. Written
 * because matroska-subtitles takes `S_TEXT/*` codecs only, and WebM's own
 * WebVTT is `D_WEBVTT/SUBTITLES` (2026-10-05, built corpus). A WebVTT block's
 * payload is the cue text; SRT and ASS blocks are text too (ASS keeps its
 * leading fields, ponytail: strip them if real files carry ASS).
 */
function matroskaTextBlocks(bytes: Uint8Array): string[][] {
  const vint = (at: number, keepMarker: boolean): [number, number] => {
    const first = bytes[at];
    let length = 1;
    while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
    let value = keepMarker ? first : first & (0xff >> length);
    for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
    return [value, length];
  };
  const CONTAINERS = new Set([0x18538067, 0x1654ae6b, 0xae, 0x1f43b675, 0xa0]);
  // Cues per track in file order, so a file with one track per language reads one language at a time.
  const textTracks = new Map<number, string[]>();
  let track = { number: 0, type: 0 };
  const walk = (start: number, end: number) => {
    for (let at = start; at < end; ) {
      const [id, idLength] = vint(at, true);
      const [size, sizeLength] = vint(at + idLength, false);
      const body = at + idLength + sizeLength;
      // An unknown size (all ones) runs to the parent's end, as live-written files do.
      const bodyEnd = size >= 2 ** (7 * sizeLength) - 1 ? end : Math.min(end, body + size);
      if (id === 0xae) track = { number: 0, type: 0 };
      if (CONTAINERS.has(id)) walk(body, bodyEnd);
      else if (id === 0xd7) track.number = bytes.subarray(body, bodyEnd).reduce((v, b) => v * 256 + b, 0);
      else if (id === 0x83) track.type = bytes[body];
      else if (id === 0xa3 || id === 0xa1) {
        const [number, numberLength] = vint(body, false);
        textTracks.get(number)?.push(new TextDecoder().decode(bytes.subarray(body + numberLength + 3, bodyEnd)).trim());
      }
      if (id === 0xae && track.type === 0x11) textTracks.set(track.number, []);
      at = bodyEnd;
    }
  };
  walk(0, bytes.length);
  return [...textTracks.values()].map((cues) => cues.filter(Boolean)).filter((cues) => cues.length);
}

/** The npm reader for the same tracks, kept as a candidate to show what it misses. */
async function matroskaSubtitles(bytes: Uint8Array): Promise<string> {
  // @ts-expect-error untyped
    const { SubtitleParser } = await import("matroska-subtitles");
    const parser = new SubtitleParser();
    const cues: string[] = [];
    parser.on("subtitle", (subtitle: { text: string }) => cues.push(subtitle.text));
    await new Promise<void>((resolve, reject) => {
      parser.on("finish", resolve);
      parser.on("error", reject);
      parser.end(Buffer.from(bytes));
    });
  if (!cues.length) throw new Error("no subtitle track");
  return cues.join("\n");
}

async function mp4TextSamples(bytes: Uint8Array): Promise<string> {
  const { createFile } = await import("mp4box");
  const file = createFile();
  const cues: string[] = [];
  file.onReady = (info) => {
    const track = info.subtitleTracks[0] ?? info.tracks.find((t) => t.codec.startsWith("tx3g"));
    if (!track) return;
    file.setExtractionOptions(track.id, null, { nbSamples: 1_000_000 });
    file.start();
  };
  file.onSamples = (_id, _user, samples) => {
    for (const sample of samples) {
      if (!sample.data || sample.data.byteLength < 2) continue;
      const length = (sample.data[0] << 8) | sample.data[1];
      if (length) cues.push(new TextDecoder().decode(sample.data.subarray(2, 2 + length)));
    }
  };
  const buffer = bytes.slice().buffer as ArrayBuffer & { fileStart: number };
  buffer.fileStart = 0;
  file.appendBuffer(buffer);
  file.flush();
  if (!cues.length) throw new Error("no subtitle track");
  return cues.join("\n");
}

/**
 * On-screen text: frames picked by a sampler, each OCRed by tesseract.js (the
 * product's reader), consecutive repeats dropped, each kept frame marked with
 * its time as Docling marks segments. Frames come from ffmpeg here, from
 * WebCodecs in a browser. Samplers, all from Docling's `video_frame_sampling.py`:
 * `fixed` every 10 s (its default interval), `scene` its scene-change rule (1 fps
 * 64x64 thumbnails, mean absolute difference, peaks with prominence
 * max(0.012, median + 5 * MAD) at least 2 s apart, one frame mid-scene), and
 * `all` every 1 s frame, the ceiling that OCRs everything.
 */
function framesOcr(sampler: "fixed" | "scene" | "all", floor = 0.012, lineDedupe = false): Candidate {
  return {
    formats: ["mp4", "mkv", "webm", "mov"],
    extract: async () => {
      const { spawnSync } = await import("node:child_process");
      const ffmpeg = (args: string[]) => {
        const out = spawnSync("ffmpeg", ["-v", "error", ...args], { maxBuffer: 1 << 30 });
        if (out.status !== 0) throw new Error(`ffmpeg: ${out.stderr.toString().slice(0, 200)}`);
        return out.stdout;
      };
      const SIZE = 64 * 64 * 3;
      const thumbs = ffmpeg(["-i", currentFile, "-vf", "fps=1,scale=64:64", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      const count = Math.floor(thumbs.length / SIZE);
      let times: number[];
      if (sampler === "all") times = Array.from({ length: count }, (_, i) => i);
      else if (sampler === "fixed") times = Array.from({ length: Math.ceil(count / 10) }, (_, i) => i * 10);
      else {
        const diffs: number[] = [];
        for (let i = 1; i < count; i++) {
          let sum = 0;
          for (let j = 0; j < SIZE; j++) sum += Math.abs(thumbs[i * SIZE + j] - thumbs[(i - 1) * SIZE + j]);
          diffs.push(sum / SIZE / 255);
        }
        const boundaries = [0, ...scenePeaks(diffs, 2, floor).filter((p) => p >= 2)];
        // ponytail: the scene's middle frame, not Docling's sharpest of five; add sharpness when real footage blurs.
        times = boundaries.map((start, i) => (start + (boundaries[i + 1] ?? count - 1)) / 2);
      }
      const worker = await tesseractWorker();
      const kept: string[] = [];
      let previous = "";
      let previousLines = new Set<string>();
      for (const t of times.slice(0, 200)) {
        const png = ffmpeg(["-ss", String(t), "-i", currentFile, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
        let text = (await worker.recognize(png)).data.text.trim();
        if (lineDedupe) {
          // A burned-in subtitle changes under a slide that does not: keep only the lines the last frame lacked.
          const lines = text.split("\n").filter((l) => l.trim());
          const norm = (l: string) => l.replace(/\W+/g, " ").trim();
          text = lines.filter((l) => !previousLines.has(norm(l))).join("\n");
          previousLines = new Set(lines.map(norm));
        }
        const key = text.replace(/\W+/g, " ").trim();
        if (!key || key === previous) continue;
        previous = key;
        kept.push(`[frame ${t}s]\n${text}`);
      }
      return kept.join("\n\n");
    },
  };
}

/**
 * scipy.signal.find_peaks(x, prominence=auto, distance) as Docling calls it:
 * strict local maxima, scipy's prominence (height over the higher of the two
 * lowest points before a taller peak on either side), then the tallest peaks
 * kept first with the others within `distance` dropped.
 */
function scenePeaks(x: number[], distance: number, floor: number): number[] {
  const sorted = [...x].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const deviations = x.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const threshold = Math.max(floor, median + 5 * 1.4826 * (deviations[Math.floor(deviations.length / 2)] ?? 0));
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (!(x[i] > x[i - 1] && x[i] > x[i + 1])) continue;
    let left = x[i], right = x[i];
    for (let j = i - 1; j >= 0 && x[j] <= x[i]; j--) left = Math.min(left, x[j]);
    for (let j = i + 1; j < x.length && x[j] <= x[i]; j++) right = Math.min(right, x[j]);
    if (x[i] - Math.max(left, right) >= threshold) peaks.push(i);
  }
  const kept: number[] = [];
  for (const p of [...peaks].sort((a, b) => x[b] - x[a])) if (kept.every((k) => Math.abs(k - p) >= distance)) kept.push(p);
  return kept.sort((a, b) => a - b);
}

/** A page as the browser would see it; jsdom stands in for DOMParser under Node. */
async function htmlDocument(bytes: Uint8Array): Promise<Document> {
  const { JSDOM } = await import("jsdom");
  return new JSDOM(new TextDecoder().decode(bytes), { url: "https://example.com/" }).window.document;
}

const CANDIDATES: Record<string, Candidate> = {
  // An .html file goes into the bundle verbatim today.
  "fileconcat-html": { formats: ["html"], extract: async (bytes) => new TextDecoder().decode(bytes) },
  // The Clipper's own pair: Readability picks the article, Turndown writes markdown.
  readability: {
    formats: ["html"],
    extract: async (bytes) => {
      const { Readability } = await import("@mozilla/readability");
      const { default: TurndownService } = await import("turndown");
      const article = new Readability(await htmlDocument(bytes)).parse();
      return article?.content ? new TurndownService({ headingStyle: "atx" }).turndown(article.content) : "";
    },
  },
  defuddle: {
    formats: ["html"],
    extract: async (bytes) => {
      const { Defuddle } = await import("defuddle/node");
      return (await Defuddle(await htmlDocument(bytes), "https://example.com/", { markdown: true })).content;
    },
  },
  // The Node (NAPI) build of the same Rust converter a browser loads as wasm; `minimal` isolates the main content.
  mdream: {
    formats: ["html"],
    extract: async (bytes) => {
      const { htmlToMarkdown } = await import("mdream");
      return htmlToMarkdown(new TextDecoder().decode(bytes), { minimal: true });
    },
  },
  tesseract: {
    formats: ["png"],
    extract: async (bytes) => (await (await tesseractWorker()).recognize(Buffer.from(bytes))).data.text,
  },
  "paddle-v6-tiny": paddle("V6_TINY_MODEL"),
  "paddle-v6-small": paddle("V6_SMALL_MODEL"),
  "paddle-v6-medium": paddle("V6_MEDIUM_MODEL"),
  "paddle-v5-en": paddle("V5_EN_MOBILE_MODEL"),
  // The product's own node path, the same one measure-extraction scores:
  // the byte router, then the CLI's parser registry with core's visitors.
  fileconcat: {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "doc", "xls", "ppt", "docm", "dotx", "xlsm", "xlsb", "pptm", "eml", "msg", "epub"],
    extract: async (bytes) => {
      const route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
      if (route.kind !== "extract") throw new Error(`routed as ${route.kind}`);
      // The CLI registers no `cfb` loader; the web product does, and it is
      // the product this baseline stands for.
      if (route.parserId === "cfb") {
        const { extractCfb } = await import("../../../apps/web/src/lib/extract-cfb-client.js");
        return extractCfb(bytes).text;
      }
      return (await parsers.extract(route.parserId, bytes, route.format)).text;
    },
  },
  // The product's archive path: the byte router, then core's fflate expansion.
  // Entries come back under a folder named after the archive; the answer key
  // is relative to the archive root, so that folder is taken off.
  "fileconcat-archive": {
    formats: ARCHIVES,
    extract: async (bytes) => {
      const route = await routeBytes(bytes.subarray(0, ROUTER_SNIFF_BYTES));
      if (route.kind !== "expand") throw new Error(`routed as ${route.kind}`);
      if (!canExpandArchive(route.archive)) throw new Error(`${route.archive} is routed but not expandable`);
      const base = `${stripArchiveSuffix(currentName)}/`;
      const entries = expandArchive(bytes, route.archive, currentName);
      return listing(entries.map((e) => [e.path.startsWith(base) ? e.path.slice(base.length) : e.path, e.bytes]));
    },
  },
  "zip.js": {
    formats: ["zip"],
    extract: async (bytes) => {
      const zip = await import("@zip.js/zip.js");
      zip.configure({ useWebWorkers: false });
      const reader = new zip.ZipReader(new zip.Uint8ArrayReader(bytes));
      const files: [string, Uint8Array][] = [];
      for (const entry of await reader.getEntries()) {
        if (!entry.directory) files.push([entry.filename, await entry.getData(new zip.Uint8ArrayWriter())]);
      }
      await reader.close();
      return listing(files);
    },
  },
  libarchive: {
    formats: ARCHIVES,
    extract: async (bytes) => {
      const { ArchiveReader } = await import("libarchive-wasm");
      const reader = new ArchiveReader(await libarchiveModule(), new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
      try {
        const files: [string, Uint8Array][] = [];
        for (const entry of reader.entries()) {
          if (entry.getFiletype() !== "File") continue;
          const data = entry.readData() ?? new Int8Array();
          files.push([entry.getPathname(), new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))]);
        }
        return listing(files);
      } finally {
        reader.free();
      }
    },
  },
  // 7-Zip unpacks one layer at a time: a .tar.gz gives a .tar, which a router
  // would hand back to it, so a lone .tar out is unpacked once more.
  "7z": {
    formats: ARCHIVES,
    extract: async (bytes) => {
      let files = await sevenZip(currentName, bytes);
      if (files.length === 1 && files[0][0].endsWith(".tar")) files = await sevenZip(files[0][0], files[0][1]);
      return listing(files);
    },
  },
  "node-unrar-js": {
    formats: ["rar"],
    extract: async (bytes) => {
      const { createExtractorFromData } = await import("node-unrar-js");
      const extractor = await createExtractorFromData({ data: bytes.slice().buffer });
      const files: [string, Uint8Array][] = [];
      for (const file of extractor.extract().files) {
        if (!file.fileHeader.flags.directory && file.extraction) files.push([file.fileHeader.name, file.extraction]);
      }
      return listing(files);
    },
  },
  "officeparser-8.1": officeparser8({}),
  "officeparser-8.1-flow": officeparser8({ ignorePageGeometry: true }),
  // foliate-js (the Foliate reader's engine, browser-only) with jsdom's DOMParser
  // standing in for the browser's. Every section in spine order, through
  // Turndown like the HTML candidates.
  "foliate-js": {
    formats: ["epub", "mobi", "azw3"],
    extract: async (bytes) => {
      const { JSDOM } = await import("jsdom");
      const g = globalThis as Record<string, unknown>;
      const { window } = new JSDOM("");
      g.DOMParser ??= window.DOMParser;
      g.XMLSerializer ??= window.XMLSerializer;
      g.document ??= window.document;
      // jsdom has no CSS namespace; KF8 only asks it to escape selectors.
      g.CSS ??= { escape: (v: string) => v.replace(/[^\w-]/g, (c) => `\\${c}`) };
      const file = new File([bytes], currentName);
      let book: { sections: { createDocument?: () => Promise<Document> }[] };
      if (currentName.endsWith(".epub")) {
        const { ZipReader, BlobReader, TextWriter, BlobWriter } = await import("@zip.js/zip.js");
        const entries = await new ZipReader(new BlobReader(file), { useWebWorkers: false }).getEntries();
        const map = new Map(entries.flatMap((entry) => (entry.directory ? [] : [[entry.filename, entry] as const])));
        const loader = {
          entries,
          loadText: (name: string) => map.get(name)?.getData?.(new TextWriter()) ?? null,
          loadBlob: (name: string, type?: string) => map.get(name)?.getData?.(new BlobWriter(type)) ?? null,
          getSize: (name: string) => map.get(name)?.uncompressedSize ?? 0,
        };
        // @ts-expect-error untyped ESM
        const { EPUB } = await import("foliate-js/epub.js");
        book = await new EPUB(loader).init();
      } else {
        // @ts-expect-error untyped ESM
        const { MOBI } = await import("foliate-js/mobi.js");
        // The copy foliate-js vendors and its own viewer passes in.
        // @ts-expect-error untyped ESM
        const { unzlibSync } = await import("foliate-js/vendor/fflate.js");
        book = await new MOBI({ unzlib: unzlibSync }).open(file);
      }
      const { default: TurndownService } = await import("turndown");
      const turndown = new TurndownService({ headingStyle: "atx" });
      const parts: string[] = [];
      for (const section of book.sections) {
        const doc = await section.createDocument?.();
        if (doc?.body) parts.push(turndown.turndown(doc.body.innerHTML));
      }
      return parts.join("\n\n");
    },
  },
  "whisper-tiny": asr("onnx-community/whisper-tiny", "q8", true),
  "whisper-tiny-fp32": asr("onnx-community/whisper-tiny", "fp32", true),
  // tiny's encoder breaks at 8 bits (repetition loops, 2026-10-05), so it stays
  // fp32; q8 decoder, as q4 keeps the embeddings in fp32 and comes out larger.
  "whisper-tiny-encfp32": asr("onnx-community/whisper-tiny", { encoder_model: "fp32", decoder_model_merged: "q8" }, true),
  "whisper-base": asr("onnx-community/whisper-base", "q8", true),
  "whisper-small": asr("onnx-community/whisper-small", "q8", true),
  "whisper-large-v3-turbo": asr("onnx-community/whisper-large-v3-turbo", "q8", true),
  "moonshine-tiny": asr("onnx-community/moonshine-tiny-ONNX", "q8", false),
  "moonshine-base": asr("onnx-community/moonshine-base-ONNX", "q8", false),
  "subtitle-track": { formats: ["mp4", "mkv", "webm", "mov"], extract: subtitleTrack },
  "matroska-subtitles": { formats: ["mkv", "webm"], extract: matroskaSubtitles },
  "frames-fixed": framesOcr("fixed"),
  "frames-scene": framesOcr("scene"),
  "frames-all": framesOcr("all"),
  // Docling's 0.012 floor misses text-only slide changes (0.0106-0.0116 on the
  // built corpus); the floor binds only on static video, as busy footage lifts
  // median + 5 MAD above it anyway.
  "frames-scene-low": framesOcr("scene", 0.003),
  "frames-scene-low-lines": framesOcr("scene", 0.003, true),
  // The product's .xls rendering (SheetJS, a csv per sheet) over every workbook
  // format, without the CFB stream-name gate in front of it.
  sheetjs: {
    formats: ["xls", "xlsx", "xlsm", "xlsb", "ods"],
    extract: async (bytes) => {
      const XLSX = createRequire(path.join(REPO_ROOT, "apps", "web", "package.json"))("xlsx") as typeof import("../../../apps/web/node_modules/xlsx");
      const workbook = XLSX.read(bytes, { type: "array" });
      return workbook.SheetNames.map((name) => ({ name, csv: XLSX.utils.sheet_to_csv(workbook.Sheets[name]).trim() }))
        .filter((sheet) => sheet.csv)
        .map((sheet) => `# Sheet: ${sheet.name}\n${sheet.csv}`)
        .join("\n\n");
    },
  },
  anydoc: {
    formats: ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "doc", "xls", "ppt", "docm", "dotx", "xlsm", "xlsb", "pptm", "epub"],
    extract: async (bytes) => (await anydocModule()).toMarkdownBytes(bytes),
  },
  "docling.rs": {
    formats: ["pdf", "docx", "xlsx", "pptx"],
    // The name only carries the format; docling sniffs nothing else from it.
    extract: async (bytes) => (await doclingModule()).convert(bytes, `input${path.extname(currentName)}`, "markdown"),
  },
  liteparse: {
    formats: ["pdf"],
    extract: async (bytes) => {
      const lite = await liteparseModule();
      const parser = new lite.LiteParse({ ocrEnabled: false, outputFormat: "markdown" });
      return (await parser.parse(bytes)).text;
    },
  },
  "pdf-oxide": {
    formats: ["pdf"],
    extract: async (bytes) => {
      const { WasmPdfDocument } = await import("pdf-oxide-wasm");
      return new WasmPdfDocument(bytes).toMarkdownAll(true);
    },
  },
  mammoth: {
    formats: ["docx"],
    extract: async (bytes) => {
      const mammoth = await import("mammoth");
      // Deprecated upstream in favour of HTML and missing from its types, but
      // still the library's own markdown.
      const { convertToMarkdown } = mammoth as unknown as { convertToMarkdown: typeof mammoth.convertToHtml };
      return (await convertToMarkdown({ buffer: Buffer.from(bytes) })).value;
    },
  },
};

/** The fixture being read, for the candidates that want a file name or its path. */
let currentName = "";
let currentFile = "";

interface Run {
  text: string;
  error: string | null;
  ms: number;
}

/** Run a candidate over one file, timing it and keeping a failure as data. */
async function runOne(candidate: Candidate, file: string): Promise<Run> {
  const bytes = new Uint8Array(fs.readFileSync(file));
  currentName = path.basename(file);
  currentFile = file;
  const start = performance.now();
  let text = "";
  let error: string | null = null;
  try {
    text = await candidate.extract(bytes);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    // A trap leaves a wasm-bindgen instance poisoned: every later call fails
    // with the same "unreachable" (anydoc, 2026-10-05). The prefix tells the
    // parent to start the next file in a fresh child.
    if (err instanceof WebAssembly.RuntimeError) error = `${WASM_TRAP}${error}`;
  }
  return { text, error, ms: Math.round(performance.now() - start) };
}

const WASM_TRAP = "wasm trap: ";

/**
 * Longest one file may take before its reader is killed and the file failed.
 * `FILE_LIMIT_MS` raises it for long recordings, which take minutes per file.
 */
const FILE_LIMIT_MS = Number(process.env.FILE_LIMIT_MS) || 120_000;

/**
 * Run a candidate over many files in a child process, the way Tika's
 * ForkParser and fuzzers do: a reader that hangs is killed at the limit, one
 * that crashes (anydoc's process died after 448 benchmark pages, 2026-10-03)
 * takes only its child down, and either way the file is recorded as failed and
 * the next one starts in a fresh child. A fork, not a worker thread, because
 * it inherits tsx's loader flags and survives a native abort too.
 */
async function runIsolated(name: string, files: string[], onRun: (file: string, run: Run) => void): Promise<void> {
  let worker: ChildProcess | undefined;
  for (const file of files) {
    const w = (worker ??= fork(fileURLToPath(import.meta.url), ["--child", name]));
    const run = await new Promise<Run>((resolve) => {
      const done = (r: Run, dead: boolean): void => {
        clearTimeout(timer);
        w.removeAllListeners();
        if (dead) {
          w.kill("SIGKILL");
          worker = undefined;
        }
        resolve(r);
      };
      const timer = setTimeout(
        () => done({ text: "", error: `timeout after ${FILE_LIMIT_MS} ms`, ms: FILE_LIMIT_MS }, true),
        FILE_LIMIT_MS,
      );
      w.on("message", (r: Run) => done(r, r.error?.startsWith(WASM_TRAP) ?? false));
      w.on("error", (err) => done({ text: "", error: `crashed: ${err.message}`, ms: 0 }, true));
      w.on("exit", (code) => done({ text: "", error: `worker exited ${code}`, ms: 0 }, true));
      w.send(file);
    });
    onRun(file, run);
  }
  worker?.disconnect();
}

/**
 * Write one candidate's output in the layout olmOCR-bench's own scorer reads:
 * `<bench_data>/<candidate>/<category>/<pdf>_pg1_repeat1.md`, every benchmark
 * PDF being a single page. A failure is written as an empty page, which the
 * scorer fails like any other miss, so the score never skips what broke.
 */
async function olmocrBench(name: string, benchData: string): Promise<void> {
  const pdfRoot = path.join(benchData, "pdfs");
  const pdfs = fs
    .readdirSync(pdfRoot, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  const timing: { pdf: string; ms: number; error: string | null }[] = [];
  await runIsolated(name, pdfs.map((pdf) => path.join(pdfRoot, pdf)), (file, { text, error, ms }) => {
    const pdf = path.relative(pdfRoot, file);
    const out = path.join(benchData, name, pdf.replace(/\.pdf$/, "_pg1_repeat1.md"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    timing.push({ pdf, ms, error });
    if (timing.length % 200 === 0) console.log(`${timing.length} of ${pdfs.length}`);
  });
  const failed = timing.filter((t) => t.error).length;
  const total = timing.reduce((a, t) => a + t.ms, 0);
  fs.writeFileSync(path.join(benchData, `timing-${name}.json`), JSON.stringify(timing, null, 2));
  console.log(`${name}: ${pdfs.length} pdfs, ${failed} failed, ${total} ms total`);
}

/**
 * Characters no reader should hand a model: the replacement character, C0
 * controls other than tab and newlines, and the private use area a font
 * without a usable map decodes into.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const GARBAGE =/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF]/g;

/** Per extension: files, failed, empty, garbage share, median and p95 time. */
function printRobustness(results: (Run & { fixture: string })[]): void {
  const byExt = new Map<string, (Run & { fixture: string })[]>();
  for (const r of results) {
    const ext = path.extname(r.fixture).slice(1).toLowerCase();
    byExt.set(ext, [...(byExt.get(ext) ?? []), r]);
  }
  console.log("| ext | files | failed | empty | garbage | p50 ms | p95 ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [ext, rows] of [...byExt].sort((a, b) => b[1].length - a[1].length)) {
    const ok = rows.filter((r) => !r.error);
    const chars = ok.reduce((a, r) => a + r.text.length, 0);
    const garbage = ok.reduce((a, r) => a + (r.text.match(GARBAGE)?.length ?? 0), 0);
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const q = (p: number): number => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
    const share = chars === 0 ? "-" : `${((100 * garbage) / chars).toFixed(2)}%`;
    const empty = ok.filter((r) => !r.text.trim()).length;
    console.log(`| ${ext} | ${rows.length} | ${rows.length - ok.length} | ${empty} | ${share} | ${q(0.5)} | ${q(0.95)} |`);
  }
}

/**
 * Against `build-archive-corpus.py`'s answer key: "exact" is every file under
 * its path with its bytes, "content" every file's bytes under any path (a
 * name decoded differently), otherwise how many of the files came back whole.
 */
function printArchiveScore(root: string, results: (Run & { fixture: string })[]): void {
  type Row = { path: string; sha256: string };
  const key = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")) as Record<string, Row[]>;
  // Other corpora (speech, video) keep their own answer key under the same name.
  if (!Array.isArray(Object.values(key)[0])) return;
  const tally: Record<string, number> = {};
  for (const r of results) {
    const want = key[r.fixture];
    if (!want) continue;
    let verdict: string;
    if (r.error) verdict = `failed: ${r.error.slice(0, 80)}`;
    else {
      const got = JSON.parse(r.text) as Row[];
      const pairs = (rows: Row[]) => rows.map((x) => `${x.path}\0${x.sha256}`).sort().join("\n");
      const shas = (rows: Row[]) => rows.map((x) => x.sha256).sort().join("\n");
      if (pairs(got) === pairs(want)) verdict = "exact";
      else if (shas(got) === shas(want)) verdict = "content";
      else verdict = `${want.filter((w) => got.some((g) => g.sha256 === w.sha256)).length} of ${want.length} files, ${got.length} returned`;
    }
    const label = verdict.split(":")[0].replace(/^\d+ of.*/, "partial");
    tally[label] = (tally[label] ?? 0) + 1;
    console.log(`${r.fixture}: ${verdict}`);
  }
  console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", "));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const candidate = CANDIDATES[name];
  if (!candidate) {
    console.error(`Usage: extract-candidate <name>. Candidates: ${Object.keys(CANDIDATES).join(", ")}`);
    process.exit(1);
  }
  const bench = argv.indexOf("--olmocr-bench");
  if (bench !== -1) {
    await olmocrBench(name, path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[bench + 1]));
    return;
  }
  const i = argv.indexOf("--out");
  const outPath =
    i === -1
      ? path.join(REPO_ROOT, "docs", "measurements", `extraction-${name}.json`)
      : path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[i + 1]);
  if (fs.existsSync(outPath) && !argv.includes("--force")) {
    console.error(`${outPath} exists. Pass --out or --force; a measurement is a record, not a temp file.`);
    process.exit(1);
  }

  // `--corpus <dir>` reads a real-file corpus (Kind B: no answers, scored for
  // robustness only) instead of the generated fixtures.
  const c = argv.indexOf("--corpus");
  const root = c === -1 ? CORPUS : path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[c + 1]);
  const fixtures = fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => candidate.formats.includes(path.extname(f).slice(1).toLowerCase()))
    .sort();
  const results: (Run & { fixture: string })[] = [];
  await runIsolated(name, fixtures.map((f) => path.join(root, f)), (file, run) => {
    const fixture = path.relative(root, file);
    results.push({ fixture, ...run });
    if (c === -1) console.log(`${fixture}: ${run.error ? `ERROR ${run.error}` : `${run.text.length} chars`} in ${run.ms} ms`);
  });
  if (c !== -1) printRobustness(results);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ reader: name, corpus: root, results }, null, 2));
  console.log(`Wrote ${outPath}`);
  if (fs.existsSync(path.join(root, "manifest.json"))) printArchiveScore(root, results);
}

if (process.argv[2] === "--child") {
  const candidate = CANDIDATES[process.argv[3]];
  process.on("message", async (file: string) => process.send!(await runOne(candidate, file)));
  // A reader's own workers (tesseract's) would otherwise keep the child alive.
  process.on("disconnect", () => process.exit(0));
} else {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
