import { createFileRoute } from "@tanstack/react-router";
import App from "~/app";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/app")({
  component: AppPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat. The tool.",
        description:
          "Combine multiple files and folders into a single LLM-ready document. Runs entirely in your browser.",
        url: "https://fileconcat.com/app",
      }),
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/app" }],
  }),
});

function AppPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <App />
      </main>
      <SiteFooter />
    </div>
  );
}
