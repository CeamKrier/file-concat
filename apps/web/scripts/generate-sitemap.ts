#!/usr/bin/env npx tsx
/**
 * Generate sitemap.xml at build time
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE_URL = "https://fileconcat.com";

interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const pages: SitemapEntry[] = [
  { url: "/", changefreq: "weekly", priority: 1.0 },
  { url: "/app", changefreq: "weekly", priority: 0.9 },
  { url: "/docs", changefreq: "weekly", priority: 0.9 },
  { url: "/docs/quick-start", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/file-filtering", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/github-import", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/gitlab-import", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/token-estimation", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/cli-usage", changefreq: "monthly", priority: 0.7 },
  { url: "/docs/configuration", changefreq: "monthly", priority: 0.7 },
];

function generateSitemap(): string {
  const today = new Date().toISOString().split("T")[0];

  const urlEntries = pages
    .map((page) => {
      const loc = `${BASE_URL}${page.url}`;
      const lastmod = page.lastmod || today;
      const changefreq = page.changefreq || "monthly";
      const priority = page.priority ?? 0.5;

      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

const outputDir = join(dirname(fileURLToPath(import.meta.url)), "../public");
const outputFile = join(outputDir, "sitemap.xml");

const sitemap = generateSitemap();
writeFileSync(outputFile, sitemap);

console.log(`Generated sitemap with ${pages.length} pages`);
