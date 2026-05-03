# Task 21: SEO Metadata & Structured Data

## Ozet

SEO icin meta tags, Open Graph, Twitter Card ve structured data (JSON-LD) ekle.

## Oncelik

Dusuk (Faz 5 - Documentation)

## Bagimliliklari

- Faz 1: TanStack Start Migration (tamamlanmis)

## Basari Kriterleri

- [ ] robots.txt olusturuldu
- [ ] sitemap.xml olusturuldu
- [ ] JSON-LD structured data eklendi
- [ ] Open Graph tags tum sayfalarda
- [ ] Twitter Card tags tum sayfalarda

## Detayli Adimlar

### 1. robots.txt

**Dosya:** `apps/web/public/robots.txt` (yeni)

```
User-agent: *
Allow: /

# Sitemap
Sitemap: https://fileconcat.com/sitemap.xml

# Block API routes
Disallow: /api/
```

### 2. Sitemap Generator Script

**Dosya:** `apps/web/scripts/generate-sitemap.ts` (yeni)

```typescript
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
  { url: "/about", changefreq: "monthly", priority: 0.8 },
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

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../public");
const OUTPUT_FILE = join(OUTPUT_DIR, "sitemap.xml");

const sitemap = generateSitemap();
writeFileSync(OUTPUT_FILE, sitemap);

console.log(`Generated sitemap with ${pages.length} pages`);
```

### 3. Package.json Script Ekleme

**Dosya:** `apps/web/package.json`

```json
{
  "scripts": {
    "generate-sitemap": "tsx scripts/generate-sitemap.ts",
    "prebuild": "pnpm fetch-models && pnpm generate-sitemap"
  }
}
```

### 4. SEO Helper Utility

**Dosya:** `apps/web/src/lib/seo.ts` (yeni)

```typescript
interface SEOConfig {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

const DEFAULT_IMAGE = "https://fileconcat.com/og-image.png";
const SITE_NAME = "FileConcat";
const TWITTER_HANDLE = "@CeamKrier";

/**
 * Generate meta tags for SEO
 */
export function generateSEOMeta(config: SEOConfig) {
  const {
    title,
    description,
    url = "https://fileconcat.com",
    image = DEFAULT_IMAGE,
    type = "website",
    publishedTime,
    modifiedTime,
    author,
  } = config;

  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  const meta = [
    // Basic
    { title: fullTitle },
    { name: "description", content: description },

    // Open Graph
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:site", content: TWITTER_HANDLE },
    { name: "twitter:creator", content: TWITTER_HANDLE },
  ];

  // Article-specific meta
  if (type === "article") {
    if (publishedTime) {
      meta.push({ property: "article:published_time", content: publishedTime });
    }
    if (modifiedTime) {
      meta.push({ property: "article:modified_time", content: modifiedTime });
    }
    if (author) {
      meta.push({ property: "article:author", content: author });
    }
  }

  return meta;
}

/**
 * Generate JSON-LD structured data for WebApplication
 */
export function generateWebApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FileConcat",
    description:
      "Free, offline tool to combine multiple files into a single document optimized for AI assistants like ChatGPT, Claude, and Gemini.",
    url: "https://fileconcat.com",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "100% Offline Processing",
      "GitHub Repository Import",
      "GitLab Repository Import",
      "Token Estimation",
      "Multiple Output Formats",
      "File Filtering with Glob Patterns",
    ],
    screenshot: "https://fileconcat.com/screenshot.png",
    softwareHelp: {
      "@type": "CreativeWork",
      url: "https://fileconcat.com/docs",
    },
    author: {
      "@type": "Person",
      name: "CeamKrier",
      url: "https://twitter.com/CeamKrier",
    },
  };
}

/**
 * Generate JSON-LD structured data for HowTo
 */
export function generateHowToSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Combine Files for AI Assistants",
    description:
      "Learn how to use FileConcat to combine multiple files into a single document optimized for ChatGPT, Claude, and other AI assistants.",
    step: [
      {
        "@type": "HowToStep",
        name: "Upload Files",
        text: "Drag and drop your files or folders, or import from a GitHub/GitLab repository.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: "Configure Filters",
        text: "Use glob patterns to include or exclude specific files. Choose from presets for popular tech stacks.",
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: "Review and Edit",
        text: "Preview file contents, toggle individual files, and make edits if needed.",
        position: 3,
      },
      {
        "@type": "HowToStep",
        name: "Export",
        text: "Copy to clipboard or download as a single file or multiple chunks for large projects.",
        position: 4,
      },
      {
        "@type": "HowToStep",
        name: "Share with AI",
        text: "Paste the optimized output into ChatGPT, Claude, or your preferred AI assistant.",
        position: 5,
      },
    ],
    tool: {
      "@type": "HowToTool",
      name: "FileConcat",
    },
  };
}
```

### 5. Root Route'a Structured Data Ekleme

**Dosya:** `apps/web/src/routes/__root.tsx`

```tsx
import { generateWebApplicationSchema, generateHowToSchema } from "~/lib/seo";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      // ... existing meta
    ],
    links: [
      // ... existing links
    ],
    scripts: [
      // JSON-LD Structured Data
      {
        type: "application/ld+json",
        children: JSON.stringify(generateWebApplicationSchema()),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(generateHowToSchema()),
      },
    ],
  }),
  // ...
});
```

### 6. Index Route SEO Guncelleme

**Dosya:** `apps/web/src/routes/index.tsx`

```tsx
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: IndexPage,
  head: () => ({
    meta: generateSEOMeta({
      title: "FileConcat - Combine Files for AI Assistants",
      description:
        "Free, offline tool to combine multiple files and folders into a single document optimized for ChatGPT, Claude, Gemini and other LLMs. Import from GitHub, GitLab, or drag & drop. 100% privacy - files never leave your browser.",
      url: "https://fileconcat.com",
    }),
  }),
});
```

### 7. OG Image Olusturma (Opsiyonel)

**Dosya:** `apps/web/public/og-image.png`

1200x630 boyutunda Open Graph image olustur. Icerigi:

- FileConcat logo
- "Combine Files for AI Assistants" tagline
- Key features icons

Tasarim araclarindan (Figma, Canva) olusturulabilir.

## Test Etme

```bash
cd apps/web

# Sitemap generate
pnpm generate-sitemap
cat public/sitemap.xml

# Build ve check
pnpm build

# Dev server
pnpm dev

# Test checklist:
# [ ] /robots.txt erisilebilir
# [ ] /sitemap.xml erisilebilir
# [ ] View Source'da JSON-LD gorunuyor
# [ ] Facebook Sharing Debugger'da OG tags gorunuyor
# [ ] Twitter Card Validator'da card gorunuyor
```

## Test Tools

- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)

## Notlar

- OG image 1200x630 minimum boyut
- JSON-LD schema.org standartlarina uygun
- Sitemap build time'da generate ediliyor
- robots.txt API endpoint'lerini engelliyor

## Rollback

```bash
rm apps/web/public/robots.txt
rm apps/web/public/sitemap.xml
rm apps/web/scripts/generate-sitemap.ts
rm apps/web/src/lib/seo.ts
# Route'lardan SEO meta kaldir
```
