// usage: tsx fc-corpus.mts <repo root at some commit> <corpus dir> <out.json>
// FileConcat's verdict on each hard file, from that tree's core: the byte router, then
// the text classifier on the head and on the whole file, as the drop path runs them.
// A tree that has the encoding guesser (chardetng) gets it, as the web app does.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [root, dir, outPath] = process.argv.slice(2);
const core = resolve(root, "packages/core/src/file-processing");
const { ROUTER_SNIFF_BYTES, routeBytes } = await import(`${core}/routing.ts`);
const { classifyBytes } = await import(`${core}/text-classification.ts`);
let guess;
if (existsSync(`${core}/encoding-guess.ts`)) {
  const { createEncodingGuesser } = await import(`${core}/encoding-guess.ts`);
  const wasm = createRequire(resolve(root, "packages/core/package.json")).resolve(
    "chardetng-wasm/dist/chardetng_wasm_bg.wasm",
  );
  guess = await createEncodingGuesser(readFileSync(wasm));
}

const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
const out = [];
for (const c of manifest) {
  const bytes = new Uint8Array(readFileSync(`${dir}/${c.name}/${c.file}`));
  const prefix = bytes.subarray(0, ROUTER_SNIFF_BYTES);
  const route = await routeBytes(prefix);
  let r;
  if (route.kind !== "unknown") r = { verdict: route.kind };
  else if (classifyBytes(prefix).classification === "binary") r = { verdict: "binary" };
  else {
    const f = classifyBytes(bytes, guess);
    r = { verdict: f.classification, text: f.text };
  }
  out.push({ name: c.name, ...r });
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
