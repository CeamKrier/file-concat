import { readdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Postbuild: writes `dist/client/third-party-notices.txt`, served at
 * `/third-party-notices.txt` and linked from `/licenses`.
 *
 * Two sources, because neither sees everything:
 *
 * - `dist/third-party-npm.json`, written by rollup-plugin-license from the
 *   client bundle's module graph (see vite.config.ts). It does not see the
 *   bundles of our own workers, so the wasm readers' JS glue is not in it.
 * - `licenses/*.txt`, one hand-assembled file per wasm reader, listing the
 *   libraries compiled into that `.wasm` (PDFium, 7-Zip, Rust crates). No JS
 *   tool can see inside a wasm binary; Chromium and VS Code keep hand
 *   manifests for the same reason.
 *
 * The build fails when a `.wasm` asset ships with no notices file, so a new
 * wasm reader cannot go out without its licences.
 */

const CLIENT_ASSETS = "dist/client/assets";
const NPM_JSON = "dist/third-party-npm.json";
const OUT = "dist/client/third-party-notices.txt";

/** Asset name prefix (before Vite's `-<hash>.wasm`) to its notices file. */
const WASM_NOTICES: Record<string, string> = {
  "7zz": "licenses/7z-wasm.txt",
  anydoc_wasm_bg: "licenses/anydoc-wasm.txt",
  liteparse_wasm_bg: "licenses/liteparse-wasm.txt",
  tiktoken_bg: "licenses/tiktoken-wasm.txt",
};

interface Dependency {
  name: string | null;
  version: string | null;
  license: string | null;
  licenseText: string | null;
  noticeText: string | null;
  repository: { url?: string } | string | null;
  homepage: string | null;
}

const prefixOf = (asset: string) =>
  Object.keys(WASM_NOTICES).find((prefix) => asset.startsWith(`${prefix}-`));

const wasmAssets = readdirSync(CLIENT_ASSETS).filter((name) => name.endsWith(".wasm"));
const unmapped = wasmAssets.filter((asset) => !prefixOf(asset));
if (unmapped.length > 0) {
  console.error(`[notices] FAIL: no notices file for ${unmapped.join(", ")}`);
  console.error("[notices] Add one under licenses/ and map it in WASM_NOTICES.");
  process.exit(1);
}

const shipped = new Set(wasmAssets.map(prefixOf));
const wasmParts = Object.entries(WASM_NOTICES)
  .filter(([prefix]) => shipped.has(prefix))
  .map(([, file]) => readFileSync(file, "utf8").trim());

const dependencies = (JSON.parse(readFileSync(NPM_JSON, "utf8")) as Dependency[])
  .filter((dependency) => !dependency.name?.startsWith("@fileconcat/"))
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const repositoryOf = (dependency: Dependency) =>
  typeof dependency.repository === "string"
    ? dependency.repository
    : (dependency.repository?.url ?? dependency.homepage ?? "");

const npmParts = dependencies.map((dependency) => {
  const source = repositoryOf(dependency);
  return [
    `${dependency.name} ${dependency.version}`,
    `License: ${dependency.license ?? "not stated"}`,
    ...(source ? [`Source: ${source}`] : []),
    "",
    dependency.licenseText?.trim() || "(the package ships no licence text)",
    ...(dependency.noticeText?.trim() ? ["", dependency.noticeText.trim()] : []),
  ].join("\n");
});

const RULE = "=".repeat(78);
const text = [
  "FileConcat third-party notices",
  "",
  "FileConcat (fileconcat.com) runs the software below in your browser. The",
  "first part lists the libraries compiled into each WebAssembly reader; the",
  "second lists the npm packages in the page's JavaScript. Source offers and",
  "the 7-Zip/unRAR terms are on https://fileconcat.com/licenses.",
  "",
  RULE,
  "PART 1: WebAssembly readers",
  RULE,
  "",
  wasmParts.join(`\n\n${RULE}\n\n`),
  "",
  RULE,
  `PART 2: npm packages (${npmParts.length})`,
  RULE,
  "",
  npmParts.join(`\n\n${"-".repeat(78)}\n\n`),
  "",
].join("\n");

writeFileSync(OUT, text);
console.log(
  `[notices] ${OUT}: ${wasmParts.length} wasm readers, ${npmParts.length} npm packages, ` +
    `${(text.length / 1024).toFixed(0)} KiB`,
);
