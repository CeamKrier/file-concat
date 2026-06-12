import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { DocsLayout } from "~/components/docs-layout";
import { generateSEOMeta } from "~/lib/seo";

// Eager glob bakes every MDX into this route chunk so SSR/prerender returns
// the rendered content in the first HTML chunk, no Suspense fallback flash.
// Relative path required: Vite's import.meta.glob does not resolve `~/`.
const docsModules = import.meta.glob<{ default: ComponentType }>(
  "../../content/docs/*.mdx",
  { eager: true },
);

function moduleForSlug(slug: string): ComponentType | null {
  return docsModules[`../../content/docs/${slug}.mdx`]?.default ?? null;
}

export const Route = createFileRoute("/docs/$slug")({
  component: DocsPage,
  loader: ({ params }) => {
    if (!moduleForSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const titleText = params.slug.replace(/-/g, " ");
    const displayTitle = titleText.replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      meta: generateSEOMeta({
        title: `${displayTitle} - FileConcat Docs`,
        description: `FileConcat documentation for ${displayTitle}.`,
        url: `https://fileconcat.com/docs/${params.slug}`,
      }),
    };
  },
});

function DocsPage() {
  const { slug } = Route.useParams();
  const Content = moduleForSlug(slug);
  if (!Content) throw notFound();

  return (
    <DocsLayout>
      <Content />
    </DocsLayout>
  );
}
