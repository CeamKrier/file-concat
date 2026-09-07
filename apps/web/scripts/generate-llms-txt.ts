#!/usr/bin/env npx tsx
/**
 * Generate llms.txt and llms-full.txt at build time per the llmstxt.org spec.
 *
 * llms.txt = structured index of doc pages grouped by sidebar section, plus
 * every published blog post.
 * llms-full.txt = every doc page and every published post, concatenated.
 *
 * Posts are enumerated from disk rather than linked in by hand. They used to
 * reach these files only when some docs page happened to link to them, which
 * meant 8 of 11 posts were absent from the one file we publish so a crawler can
 * read us, and a new post looked published while being invisible here. Walking
 * the directory makes inclusion a property of existing.
 *
 * This cannot reuse `src/lib/blog.ts`: that enumerates with `import.meta.glob`,
 * which is Vite syntax and does not resolve in a plain tsx script. The draft
 * filter and the newest-first order below have to match it by hand.
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DOCS_NAVIGATION } from "../src/lib/docs-nav";

const BASE_URL = "https://fileconcat.com";
const REPO_URL = "https://github.com/CeamKrier/file-concat";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(SCRIPT_DIR, "../src/content/docs");
const BLOG_DIR = join(SCRIPT_DIR, "../src/content/blog");
const PUBLIC_DIR = join(SCRIPT_DIR, "../public");

interface PageRecord {
  slug: string;
  href: string;
  title: string;
  summary: string;
  body: string;
  /** Posts only: ISO date, drives the newest-first order. */
  date?: string;
  /** Posts only: drafts never reach a published file. */
  draft?: boolean;
}

function slugFromHref(href: string): string {
  // `/docs` → "introduction" (the MDX file for the docs index).
  if (href === "/docs") return "introduction";
  return href.replace(/^\/docs\//, "");
}

function readPage(href: string, navTitle: string): PageRecord {
  const slug = slugFromHref(href);
  const filePath = join(DOCS_DIR, `${slug}.mdx`);
  const raw = readFileSync(filePath, "utf-8");

  // Strip the H1 and pick the first non-empty paragraph as the summary.
  const lines = raw.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => line.startsWith("# "));
  const title = h1Index >= 0 ? lines[h1Index].replace(/^#\s+/, "").trim() : navTitle;

  const afterH1 = h1Index >= 0 ? lines.slice(h1Index + 1) : lines;
  const summary = extractSummary(afterH1);

  return { slug, href, title, summary, body: raw.trim() };
}

/** One `key: "value"` line out of a post's frontmatter block. */
function frontmatterValue(raw: string, key: string): string {
  const match = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Every published post, newest first. Mirrors `getVisiblePosts` in
 * `src/lib/blog.ts`: drafts are excluded and the sort is by ISO date
 * descending. A post with `draft: true` never reaches a published file.
 */
function readPosts(): PageRecord[] {
  return readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = readFileSync(join(BLOG_DIR, file), "utf-8");
      // The body without the frontmatter block, so raw YAML never ships.
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
      return {
        slug,
        href: `/blog/${slug}`,
        title: frontmatterValue(raw, "title") || slug,
        summary: frontmatterValue(raw, "description"),
        body,
        date: frontmatterValue(raw, "date"),
        draft: frontmatterValue(raw, "draft") === "true",
      };
    })
    .filter((post) => !post.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function extractSummary(lines: string[]): string {
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collected.length > 0) break;
      continue;
    }
    // Stop at a new heading or fenced block — we only want the lead paragraph.
    if (trimmed.startsWith("#") || trimmed.startsWith("```")) break;
    collected.push(trimmed);
  }
  return collected.join(" ").replace(/\s+/g, " ");
}

function buildIndex(pages: Map<string, PageRecord>, posts: PageRecord[]): string {
  const lines: string[] = [];

  lines.push("# FileConcat");
  lines.push("");
  lines.push("> Merge all your files into one to get past the file upload limit on ChatGPT,");
  lines.push("> Claude, Gemini, and NotebookLM. Drop a repo or a folder of PDFs, Word, and");
  lines.push("> Excel files; everything, even the PDFs, is read right in your browser and");
  lines.push("> nothing is uploaded. Web app at fileconcat.com, plus a published npm CLI");
  lines.push("> `@fileconcat/cli` (bin: `file-concat`).");
  lines.push("");
  lines.push("These pages cover what the tool does, how to feed files into it, how the");
  lines.push("filter pipeline decides what survives, and how to read the token counter.");
  lines.push("Source code, schemas, and the CLI implementation live in the linked repo.");
  lines.push("");
  lines.push(`Full content as a single file: ${BASE_URL}/llms-full.txt`);
  lines.push("");

  for (const section of DOCS_NAVIGATION) {
    lines.push(`## ${section.title}`);
    lines.push("");
    for (const link of section.links) {
      const page = pages.get(link.href);
      if (!page) continue;
      const description = page.summary ? `: ${page.summary}` : "";
      lines.push(`- [${page.title}](${BASE_URL}${link.href})${description}`);
    }
    lines.push("");
  }

  if (posts.length > 0) {
    lines.push("## Blog");
    lines.push("");
    for (const post of posts) {
      const description = post.summary ? `: ${post.summary}` : "";
      lines.push(`- [${post.title}](${BASE_URL}${post.href})${description}`);
    }
    lines.push("");
  }

  lines.push("## Source code");
  lines.push("");
  lines.push(`The FileConcat implementation is open source at ${REPO_URL}. The repo is a`);
  lines.push("pnpm workspace with three members: `apps/web` (TanStack Start app deployed");
  lines.push("to Cloudflare Workers), `packages/cli` (the published CLI), and");
  lines.push("`packages/core` (the shared library both surfaces use).");
  lines.push("");
  lines.push("To grab the full source as a single LLM-ready document, FileConcat can");
  lines.push("ingest its own repository. Two ways:");
  lines.push("");
  lines.push(`- Web: open ${BASE_URL}, switch to the GitHub tab, paste`);
  lines.push(`  \`${REPO_URL}\`, click Fetch Files, then Copy or Download.`);
  lines.push("- CLI: clone the repo, then run");
  lines.push("  `pnpm dlx @fileconcat/cli ./file-concat --style markdown --output context.md`");
  lines.push("  (or install globally with `pnpm add -g @fileconcat/cli`).");
  lines.push("");

  return lines.join("\n") + "\n";
}

function buildFull(pages: Map<string, PageRecord>, posts: PageRecord[]): string {
  const lines: string[] = [];

  lines.push("# FileConcat documentation");
  lines.push("");
  lines.push(`Index: ${BASE_URL}/llms.txt`);
  lines.push("");
  lines.push(`Generated from the MDX sources at ${REPO_URL}. Every page below is the`);
  lines.push("raw Markdown content of the corresponding doc on fileconcat.com/docs.");
  lines.push("");

  for (const section of DOCS_NAVIGATION) {
    lines.push(`# ${section.title}`);
    lines.push("");
    for (const link of section.links) {
      const page = pages.get(link.href);
      if (!page) continue;
      lines.push(`<!-- source: ${BASE_URL}${link.href} -->`);
      lines.push("");
      lines.push(page.body);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  if (posts.length > 0) {
    lines.push("# Blog");
    lines.push("");
    for (const post of posts) {
      lines.push(`<!-- source: ${BASE_URL}${post.href} -->`);
      lines.push("");
      lines.push(post.body);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function main(): void {
  const pages = new Map<string, PageRecord>();
  for (const section of DOCS_NAVIGATION) {
    for (const link of section.links) {
      pages.set(link.href, readPage(link.href, link.title));
    }
  }

  const posts = readPosts();

  const indexPath = join(PUBLIC_DIR, "llms.txt");
  const fullPath = join(PUBLIC_DIR, "llms-full.txt");

  writeFileSync(indexPath, buildIndex(pages, posts));
  writeFileSync(fullPath, buildFull(pages, posts));

  console.log(`Generated llms.txt (${pages.size} docs pages, ${posts.length} posts) and llms-full.txt`);
}

main();
