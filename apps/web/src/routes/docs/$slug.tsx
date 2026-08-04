import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { DocsLayout } from "~/components/docs-layout";
import { generateSEOMeta } from "~/lib/seo";

interface DocsModule {
  default: ComponentType;
  frontmatter?: { title?: string; description?: string };
}

// Eager glob bakes every MDX into this route chunk so SSR/prerender returns
// the rendered content in the first HTML chunk, no Suspense fallback flash.
// Relative path required: Vite's import.meta.glob does not resolve `~/`.
const docsModules = import.meta.glob<DocsModule>("../../content/docs/*.mdx", { eager: true });

function moduleForSlug(slug: string): DocsModule | null {
  return docsModules[`../../content/docs/${slug}.mdx`] ?? null;
}

// `/docs` renders introduction.mdx itself, so `/docs/introduction` served a
// byte-identical page under a second URL that nothing links to and the sitemap
// omits. Two URLs for one document is worth a redirect, not a canonical hint.
const DUPLICATES_HUB = "introduction";

export const Route = createFileRoute("/docs/$slug")({
  component: DocsPage,
  beforeLoad: ({ params }) => {
    // 301, not the router's default 307: the consolidation is permanent and a
    // temporary redirect leaves both URLs in the index.
    if (params.slug === DUPLICATES_HUB) throw redirect({ to: "/docs", statusCode: 301 });
  },
  loader: ({ params }) => {
    if (!moduleForSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const mod = moduleForSlug(params.slug);
    const fm = mod?.frontmatter;
    const titleText = params.slug.replace(/-/g, " ");
    const displayTitle = titleText.replace(/\b\w/g, (char) => char.toUpperCase());
    const url = `https://fileconcat.com/docs/${params.slug}`;

    return {
      meta: generateSEOMeta({
        // Prefer per-page frontmatter when present; fall back to the slug so
        // pages without frontmatter keep working unchanged.
        title: fm?.title ?? `${displayTitle} - FileConcat Docs`,
        description: fm?.description ?? `FileConcat documentation for ${displayTitle}.`,
        url,
      }),
      // Every other route in the app declares one; docs were the only pages
      // shipping without it. `head` still runs for a slug the loader rejects,
      // so skip it there rather than telling a crawler a 404 is canonical.
      links: mod ? [{ rel: "canonical", href: url }] : [],
    };
  },
});

function DocsPage() {
  const { slug } = Route.useParams();
  const mod = moduleForSlug(slug);
  if (!mod) throw notFound();
  const Content = mod.default;

  return (
    <DocsLayout>
      <Content />
    </DocsLayout>
  );
}
