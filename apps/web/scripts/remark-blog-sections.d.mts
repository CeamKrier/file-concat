/**
 * Types for the section-numbering remark plugin.
 *
 * The plugin itself is plain `.mjs` because `vite.config.ts` loads it directly
 * at config time, before any TypeScript build step exists to compile it.
 */

/** A `##` section, as exported onto every blog MDX module. */
export interface BlogSectionMeta {
  /** Zero padded position, "01".."NN". */
  index: string;
  /** Slug of the heading text, matching the id set on the heading. */
  id: string;
  text: string;
}

/**
 * Numbers the depth-2 headings of a blog post, marks each section's first
 * paragraph as its summary line, and adds `sections` and `readingMinutes`
 * exports to the module. Does nothing outside `content/blog`.
 */
export function remarkBlogSections(): (tree: unknown, file: unknown) => void;
