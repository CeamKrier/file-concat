import { createFileRoute, Link } from "@tanstack/react-router";

import { BlogShell } from "~/components/blog/blog-shell";
import { formatPostDate, getVisiblePosts } from "~/lib/blog";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/blog/")({
  component: BlogIndexPage,
  head: () => ({
    meta: generateSEOMeta({
      title: "Blog - FileConcat",
      description:
        "Notes on bundling files for LLMs: combining a codebase or documents into one prompt, token budgets, and getting clean context into ChatGPT, Claude, or Gemini.",
      url: "https://fileconcat.com/blog",
    }),
    links: [{ rel: "canonical", href: "https://fileconcat.com/blog" }],
  }),
});

function BlogIndexPage() {
  const posts = getVisiblePosts();

  return (
    <BlogShell>
      <header className="max-w-[46ch]">
        <h1 className="font-display text-ink text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.035em]">
          Blog
        </h1>
        <p className="text-ink-muted mt-4 text-[15.5px] leading-[1.7]">
          Notes on turning a folder, a codebase, or a stack of documents into one clean prompt for
          ChatGPT, Claude, or Gemini, and on the token budgets that decide what fits.
        </p>
      </header>

      {posts.length > 0 ? (
        <ol className="mt-12 sm:mt-16">
          {posts.map((post) => (
            <li key={post.slug} className="border-hairline border-t last:border-b">
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="focus-visible:ring-ring focus-visible:ring-offset-background group -mx-3 flex flex-col gap-1.5 rounded-md px-3 py-6 outline-none transition-colors duration-150 hover:bg-[oklch(var(--surface-alt)/0.6)] focus-visible:ring-2 focus-visible:ring-offset-2 sm:flex-row sm:items-baseline sm:gap-8"
              >
                <time
                  dateTime={post.frontmatter.date}
                  className="text-ink-faint shrink-0 font-mono text-[12px] tabular-nums sm:w-[104px] sm:pt-1"
                >
                  {formatPostDate(post.frontmatter.date)}
                  {post.frontmatter.draft ? ", draft" : ""}
                </time>
                <div className="min-w-0">
                  <h2 className="font-display text-ink group-hover:text-primary text-[19px] font-semibold leading-snug tracking-[-0.02em] transition-colors duration-150">
                    {post.frontmatter.title}
                  </h2>
                  {post.frontmatter.description && (
                    <p className="text-ink-muted mt-1.5 max-w-[58ch] text-[14.5px] leading-relaxed">
                      {post.frontmatter.description}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="border-hairline mt-14 border-t pt-14 sm:mt-20 sm:pt-20">
          <p className="text-ink-secondary max-w-[44ch] text-[15.5px] leading-[1.7]">
            The first posts are being written.
          </p>
          <p className="text-ink-muted mt-3 max-w-[46ch] text-[14.5px] leading-relaxed">
            In the meantime, the{" "}
            <Link
              to="/docs"
              className="text-ink decoration-primary/50 hover:decoration-primary underline decoration-1 underline-offset-[4px] transition-colors duration-150"
            >
              docs
            </Link>{" "}
            cover how FileConcat picks, filters, and bundles your files into one document.
          </p>
        </div>
      )}
    </BlogShell>
  );
}
