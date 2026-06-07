#!/usr/bin/env npx tsx
/**
 * Build-time script that fetches the models.dev catalog and produces a
 * deduped, deploy-stable list for the web app.
 *
 * The catalog endpoint already exposes provider-agnostic canonical models
 * alongside per-provider offerings, so the script just joins the two and
 * keeps the cheapest priced provider per canonical model. The result is
 * sorted by release_date descending, so newer models surface first.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  buildTextModelsFromCatalog,
  type CatalogResponse,
  type ModelsRegistry,
} from "@fileconcat/core";

const CATALOG_URL = "https://models.dev/catalog.json";
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const OUTPUT_FILE = join(OUTPUT_DIR, "models.json");

async function fetchCatalog(): Promise<CatalogResponse> {
  console.log("Fetching catalog from", CATALOG_URL);

  const response = await fetch(CATALOG_URL, {
    headers: {
      "User-Agent": "FileConcat/1.0 (https://fileconcat.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<CatalogResponse>;
}

async function main() {
  try {
    const catalog = await fetchCatalog();
    const textModels = buildTextModelsFromCatalog(catalog);
    const canonicalCount = Object.keys(catalog.models ?? {}).length;

    // Client-facing payload omits the raw provider blob: the runtime never
    // reads it, and it was inflating the SSR bundle for no benefit.
    const registry: Omit<ModelsRegistry, "providers"> = {
      lastUpdated: new Date().toISOString(),
      totalModels: canonicalCount,
      textModels,
    };

    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));

    console.log(
      `Catalog join: ${canonicalCount} canonical models, ${textModels.length} text-text with a priced provider`,
    );
    console.log(`Last updated: ${registry.lastUpdated}`);
    console.log(`Wrote ${OUTPUT_FILE}`);

    // Top 10 most recent so the prebuild log shows the head of the list at a glance.
    console.log("\nTop 10 by release date:");
    for (const m of textModels.slice(0, 10)) {
      const cost = `$${m.inputCost}/$${m.outputCost}`;
      console.log(`  ${m.releaseDate}  ${m.name.padEnd(28)} via ${m.providerName} (${cost})`);
    }
  } catch (error) {
    console.error("Error fetching catalog:", error);
    if (existsSync(OUTPUT_FILE)) {
      console.warn(
        `Falling back to existing ${OUTPUT_FILE}. Re-run with network access to refresh.`,
      );
      process.exit(0);
    }
    process.exit(1);
  }
}

main();
