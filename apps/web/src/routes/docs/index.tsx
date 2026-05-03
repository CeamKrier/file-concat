import { createFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "~/components/docs-layout";
import IntroductionMdx from "~/content/docs/introduction.mdx";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/docs/")({
  component: DocsIndexPage,
  head: () => ({
    meta: generateSEOMeta({
      title: "Documentation - FileConcat",
      description: "Learn how to use FileConcat to combine files for AI assistants.",
      url: "https://fileconcat.com/docs",
    }),
  }),
});

function DocsIndexPage() {
  return (
    <DocsLayout>
      <IntroductionMdx />
    </DocsLayout>
  );
}
