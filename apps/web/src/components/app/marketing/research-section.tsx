import { Link } from "@tanstack/react-router";

import { getResearchPosts } from "~/lib/blog";
import { BandLink, MarketingSection } from "./section";

/** How many rows the list holds before it becomes the blog index. */
const LIMIT = 5;

/**
 * Band 9: the research posts, newest first, read off the blog glob at build
 * time. Nothing is listed by hand: a post with `kind: "research"` in its
 * frontmatter is here on the deploy that ships it, and a how-to never is.
 */
export function ResearchSection() {
  const posts = getResearchPosts().slice(0, LIMIT);
  if (posts.length === 0) return null;

  return (
    <MarketingSection tone="alt" labelledBy="latest-research" className="md:py-16">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <h2
          id="latest-research"
          className="font-display text-ink text-[20px] font-semibold leading-[1.1] tracking-[-0.02em]"
        >
          Latest from the research
        </h2>
        <BandLink to="/blog" className="text-[14px]">
          All research
        </BandLink>
      </div>
      <ul className="border-border-strong border-t">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="border-border text-ink hover:text-go-fg focus-visible:ring-ring focus-visible:ring-offset-background grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b py-3.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span className="text-[15.5px] leading-[1.4]">{post.frontmatter.title}</span>
              <time
                dateTime={post.frontmatter.date}
                className="text-ink-muted whitespace-nowrap font-mono text-[11.5px] tabular-nums"
              >
                {post.frontmatter.date}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}
