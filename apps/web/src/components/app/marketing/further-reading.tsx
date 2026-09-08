import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * The one internal path from a persona or how-to page into the blog.
 *
 * These pages carry most of the site's search impressions and, until this
 * existed, linked to no post at all: the only way into an article was the blog
 * index. A crawler that never reaches an article does not weigh it, and the
 * research posts are the pages worth weighing.
 *
 * Deliberately one sentence rather than a related-posts grid. An identical card
 * block on ten pages is the brand ban, and a footnote-weight line under the
 * closing call to action costs the page nothing it was using.
 */
export function FurtherReading({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-faint mx-auto mt-8 max-w-[60ch] text-[12.5px] leading-relaxed">
      {children}
    </p>
  );
}

/** A text link at prose weight, matching the footnote links already on these pages. */
export function ProseLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
    >
      {children}
    </Link>
  );
}
