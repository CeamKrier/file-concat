import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { BlogShell } from "~/components/blog/blog-shell";
import { BlogMDXProviderWrapper } from "~/components/blog/blog-mdx-provider";
import { formatPostDate, getPostBySlug } from "~/lib/blog";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  loader: ({ params }) => {
    if (!getPostBySlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const post = getPostBySlug(params.slug);
    if (!post) return {};
    const url = `https://fileconcat.com/blog/${post.slug}`;
    return {
      meta: generateSEOMeta({
        title: `${post.frontmatter.title} - FileConcat`,
        description: post.frontmatter.description,
        url,
        type: "article",
        publishedTime: post.frontmatter.date || undefined,
        author: post.frontmatter.author,
      }),
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function BlogPostPage() {
  const { slug } = Route.useParams();
  const post = getPostBySlug(slug);
  if (!post) throw notFound();

  const { title, date, author } = post.frontmatter;
  const Content = post.Content;

  return (
    <BlogShell>
      <article>
        <header className="border-hairline mb-10 border-b pb-8">
          <Link
            to="/blog"
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background -ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 font-mono text-[12px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Blog
          </Link>
          <h1
            className="font-display text-ink mt-6 text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.035em]"
            style={{ textWrap: "balance" }}
          >
            {title}
          </h1>
          <div className="text-ink-faint mt-4 flex flex-wrap items-center gap-2 font-mono text-[12.5px]">
            {date && <time dateTime={date}>{formatPostDate(date)}</time>}
            {author && (
              <>
                <span aria-hidden="true">/</span>
                <span>{author}</span>
              </>
            )}
          </div>
        </header>

        <BlogMDXProviderWrapper>
          <Content />
        </BlogMDXProviderWrapper>
      </article>
    </BlogShell>
  );
}
