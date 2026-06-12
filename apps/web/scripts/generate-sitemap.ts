#!/usr/bin/env npx tsx
/**
 * Generate sitemap.xml at build time
 */

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE_URL = "https://fileconcat.com";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

interface SitemapEntry {
  url: string;
  /** Path(s) relative to repo root. Used to derive <lastmod> from git. */
  sourceFile?: string | string[];
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const pages: SitemapEntry[] = [
  {
    url: "/",
    sourceFile: ["apps/web/src/routes/index.tsx", "apps/web/src/components/landing"],
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    url: "/app",
    sourceFile: ["apps/web/src/routes/app.tsx", "apps/web/src/app.tsx"],
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    url: "/docs",
    sourceFile: "apps/web/src/routes/docs/index.tsx",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    url: "/docs/quick-start",
    sourceFile: "apps/web/src/content/docs/quick-start.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/github-import",
    sourceFile: "apps/web/src/content/docs/github-import.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/gitlab-import",
    sourceFile: "apps/web/src/content/docs/gitlab-import.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/bitbucket-import",
    sourceFile: "apps/web/src/content/docs/bitbucket-import.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/file-filtering",
    sourceFile: "apps/web/src/content/docs/file-filtering.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/filter-precedence",
    sourceFile: "apps/web/src/content/docs/filter-precedence.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/token-estimation",
    sourceFile: "apps/web/src/content/docs/token-estimation.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/token-costs",
    sourceFile: "apps/web/src/content/docs/token-costs.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/configuration",
    sourceFile: "apps/web/src/content/docs/configuration.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/docs/cli-usage",
    sourceFile: "apps/web/src/content/docs/cli-usage.mdx",
    changefreq: "monthly",
    priority: 0.6,
  },
];

function gitLastModifiedDate(filePath: string): string | undefined {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%aI", "--", filePath], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    return out ? out.split("T")[0] : undefined;
  } catch {
    return undefined;
  }
}

function resolveLastmod(sourceFile: SitemapEntry["sourceFile"], today: string): string {
  if (!sourceFile) return today;
  const paths = Array.isArray(sourceFile) ? sourceFile : [sourceFile];
  const dates = paths.map(gitLastModifiedDate).filter((d): d is string => Boolean(d));
  if (dates.length === 0) return today;
  return dates.sort().pop() as string;
}

function generateSitemap(): string {
  const today = new Date().toISOString().split("T")[0];

  const urlEntries = pages
    .map((page) => {
      const loc = `${BASE_URL}${page.url}`;
      const lastmod = resolveLastmod(page.sourceFile, today);
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
