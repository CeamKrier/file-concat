import { createFileRoute, notFound } from "@tanstack/react-router";
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

export const Route = createFileRoute("/docs/$slug")({
  component: DocsPage,
  loader: ({ params }) => {
    if (!moduleForSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const fm = moduleForSlug(params.slug)?.frontmatter;
    const titleText = params.slug.replace(/-/g, " ");
    const displayTitle = titleText.replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      meta: generateSEOMeta({
        // Prefer per-page frontmatter when present; fall back to the slug so
        // pages without frontmatter keep working unchanged.
        title: fm?.title ?? `${displayTitle} - FileConcat Docs`,
        description: fm?.description ?? `FileConcat documentation for ${displayTitle}.`,
        url: `https://fileconcat.com/docs/${params.slug}`,
      }),
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
