import type { ComponentType } from "react";

export interface BlogFrontmatter {
  title: string;
  description: string;
  /** ISO date, e.g. "2026-07-15". Drives ordering and the article timestamp. */
  date: string;
  /** Drafts render in dev but stay out of the listing, sitemap, and production. */
  draft?: boolean;
  author?: string;
}

export interface BlogPost {
  slug: string;
  frontmatter: BlogFrontmatter;
  Content: ComponentType;
}

interface BlogModule {
  default: ComponentType;
  frontmatter?: Partial<BlogFrontmatter>;
}

// Eager glob so a post renders in the first SSR HTML chunk (same rationale as
// docs/$slug.tsx). Relative path required: import.meta.glob ignores the `~` alias.
const modules = import.meta.glob<BlogModule>("../content/blog/*.mdx", { eager: true });

const isDev = import.meta.env.DEV;

function slugFromPath(filePath: string): string {
  return filePath
    .split("/")
    .pop()!
    .replace(/\.mdx$/, "");
}

function toPost(filePath: string, mod: BlogModule): BlogPost {
  const fm = mod.frontmatter ?? {};
  const slug = slugFromPath(filePath);
  return {
    slug,
    Content: mod.default,
    frontmatter: {
      title: fm.title ?? slug,
      description: fm.description ?? "",
      date: fm.date ?? "",
      draft: fm.draft ?? false,
      author: fm.author,
    },
  };
}

const allPosts: BlogPost[] = Object.entries(modules)
  .map(([filePath, mod]) => toPost(filePath, mod))
  .sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));

/** Posts that ship on the public listing: drafts hidden outside dev, newest first. */
export function getVisiblePosts(): BlogPost[] {
  return allPosts.filter((p) => isDev || !p.frontmatter.draft);
}

/** A single post by slug, or null. Drafts resolve only in dev. */
export function getPostBySlug(slug: string): BlogPost | null {
  const post = allPosts.find((p) => p.slug === slug);
  if (!post) return null;
  if (post.frontmatter.draft && !isDev) return null;
  return post;
}

/** True once at least one non-draft post exists (gates the public nav link). */
export function hasPublishedPosts(): boolean {
  return allPosts.some((p) => !p.frontmatter.draft);
}

export function formatPostDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
