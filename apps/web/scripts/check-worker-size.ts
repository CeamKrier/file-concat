import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Postbuild guard on the size of the Cloudflare worker upload.
 *
 * ## What this counts — read before changing anything
 *
 * `dist/server/wrangler.json` is generated with `no_bundle: true` and
 * `rules: [{ type: "ESModule", globs: ["**\/*.js", "**\/*.mjs"] }]`, so wrangler
 * uploads **every** `.js`/`.mjs` file under `dist/server` as its own module —
 * there is no further bundling or tree-shaking at deploy time.
 *
 * The limit Cloudflare enforces is on the **gzipped** total of those modules
 * concatenated. Not the raw total. From wrangler's own bundle-reporter:
 *
 *     MAX_GZIP_SIZE_BYTES = 3 * 1024 * 1024
 *     gzipSize = gzipSync(concat(modules.map((m) => m.content))).byteLength
 *     percentage = gzipSize / MAX_GZIP_SIZE_BYTES * 100
 *
 * This script reproduces that exactly, so its number matches the `gzip:` figure
 * in `wrangler deploy`'s own report.
 *
 * The raw total is reported too, and it sits near 3 MiB today — which looks
 * alarming and is not. It is **not** the enforced number. Do not "fix" this
 * script to fail on raw bytes; it would fail a deploy that Cloudflare would
 * happily accept.
 *
 * There is no CI in this repo, so this runs as `postbuild`. That means it can
 * only fail a build someone actually runs — which is every build, since
 * `pnpm deploy` is `pnpm build && wrangler deploy`.
 */

const SERVER_DIR = "dist/server";
/** Wrangler's own constant. Cloudflare's ceiling, not our target. */
const LIMIT_BYTES = 3 * 1024 * 1024;
/**
 * Our budget, and deliberately far below the ceiling: the bundle sits near
 * 360 KiB, so a threshold anywhere near 3 MiB would only ever fire once the
 * damage was done. 1 MiB leaves generous room for ordinary growth while still
 * catching the failure this exists for — a client-only library statically
 * imported into the SSR graph, which costs hundreds of KiB in one commit.
 *
 * Crossing it is a decision, not a crisis. Cloudflare would still accept the
 * deploy; raising the number is a legitimate answer, taken on purpose.
 */
const BUDGET_BYTES = 1024 * 1024;

const KIB = 1024;
const fmt = (bytes: number) => `${(bytes / KIB).toFixed(1)} KiB`;

interface Module {
  path: string;
  content: Buffer;
}

function collectModules(dir: string): Module[] {
  const out: Module[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      // Build metadata, not uploaded — and `manifest.json` names every asset,
      // so counting it would make every file look referenced below.
      if (entry === ".vite") continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".js") || full.endsWith(".mjs"))
        out.push({ path: full, content: readFileSync(full) });
    }
  };
  walk(dir);
  return out;
}

/**
 * Assets Vite emitted into the SSR output that no server module imports.
 *
 * The live case is the vendored `pdf.worker.min.mjs`: it reaches the SSR graph
 * through the `?url` import in `extract-document-client.ts`, and Vite emits the
 * asset even though the module itself is dead code there (the
 * `import.meta.env.SSR` guard in `parsers.ts` drops it). It is a **client**
 * asset — 1.2 MiB raw, 360 KiB gzipped, half the enforced budget — uploaded to
 * a runtime that never touches it.
 *
 * Dropping them is sound rather than a guess: a Workers module can only be
 * reached through a specifier resolved at deploy time, so a file no module
 * names is unreachable. The guard below enforces that premise instead of
 * trusting it — if any module ever gains a computed `import()`, pruning stops.
 */
function findUnreferenced(modules: Module[], entry: string): Module[] {
  const text = new Map(modules.map((m) => [m.path, m.content.toString("utf8")]));
  // Conservative on purpose: a name mentioned only inside a file that is itself
  // unreachable still counts as a reference and keeps that file.
  const haystack = [...text.values()].join("\n");

  const candidates = modules.filter((m) => {
    const name = m.path.split("/").pop()!;
    return name !== entry && !haystack.includes(name);
  });
  if (candidates.length === 0) return [];

  // Only a *reachable* module's computed import could defeat name-based
  // reachability. One inside a candidate cannot: nothing ever loads it. pdf.js
  // has exactly such an import (its openjpeg fallback), and it lives in the
  // file this prune exists to remove.
  const reachable = modules.filter((m) => !candidates.includes(m));
  const computed = reachable.flatMap((m) => [...(text.get(m.path)!.match(/\bimport\(\s*(?!["'`])/g) ?? [])]);
  if (computed.length > 0) {
    console.warn(
      `  ! ${computed.length} dynamic import(s) with a computed specifier in reachable modules —\n` +
        `    skipping the prune, because reachability can no longer be decided by name alone.`,
    );
    return [];
  }

  return candidates;
}

function main(): void {
  let modules: Module[];
  try {
    modules = collectModules(SERVER_DIR);
  } catch {
    console.error(`Worker size check: no ${SERVER_DIR} — run the build first.`);
    process.exit(1);
  }

  if (modules.length === 0) {
    console.error(`Worker size check: ${SERVER_DIR} holds no uploadable modules.`);
    process.exit(1);
  }

  const unreferenced = findUnreferenced(modules, "index.js");
  for (const module of unreferenced) {
    unlinkSync(module.path);
    console.log(
      `  pruned ${relative(SERVER_DIR, module.path)} (${fmt(module.content.length)}) — uploaded but unreachable`,
    );
  }

  const kept = modules.filter((m) => !unreferenced.includes(m));
  const raw = kept.reduce((n, m) => n + m.content.length, 0);
  const gzip = gzipSync(Buffer.concat(kept.map((m) => m.content))).byteLength;
  const percent = (gzip / LIMIT_BYTES) * 100;

  const biggest = [...kept].sort((a, b) => b.content.length - a.content.length).slice(0, 5);
  console.log(`\nWorker upload: ${kept.length} modules, ${fmt(raw)} raw`);
  console.log(
    `  gzipped: ${fmt(gzip)} — ${((gzip / BUDGET_BYTES) * 100).toFixed(0)}% of our ` +
      `${fmt(BUDGET_BYTES)} budget, ${percent.toFixed(1)}% of Cloudflare's ${fmt(LIMIT_BYTES)} limit`,
  );
  console.log(
    `  largest: ${biggest.map((m) => `${m.path.split("/").pop()} ${fmt(m.content.length)}`).join(", ")}`,
  );

  if (gzip > BUDGET_BYTES) {
    console.error(
      `\nWorker upload is ${fmt(gzip)} gzipped, over the ${fmt(BUDGET_BYTES)} budget.\n` +
        `Cloudflare's hard limit is ${fmt(LIMIT_BYTES)}, so this deploy would still be accepted —\n` +
        `decide whether the growth is wanted, then either fix it or raise BUDGET_BYTES on purpose.\n\n` +
        `The usual cause is a client-only library statically imported into the SSR graph.\n` +
        `Guard it with \`if (import.meta.env.SSR) return\` before a dynamic import: Vite\n` +
        `inlines dynamic imports in the SSR build, so a lazy import() alone will not do it.`,
    );
    process.exit(1);
  }
}

main();
