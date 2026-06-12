import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "~/components/docs-layout";
import { lazy, Suspense } from "react";
import { generateSEOMeta } from "~/lib/seo";

// Relative path required — Vite's import.meta.glob does not resolve
// path aliases like `~/` in the glob pattern.
const docsModules = import.meta.glob("../../content/docs/*.mdx");

export const Route = createFileRoute("/docs/$slug")({
  component: DocsPage,
  loader: async ({ params }) => {
    const modulePath = `../../content/docs/${params.slug}.mdx`;
    if (!docsModules[modulePath]) {
      throw notFound();
    }
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

  const Content = lazy(() =>
    import(`~/content/docs/${slug}.mdx`).then((mod) => ({
      default: mod.default,
    })),
  );

  return (
    <DocsLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <Content />
      </Suspense>
    </DocsLayout>
  );
}
