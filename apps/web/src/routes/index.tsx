import { createFileRoute } from "@tanstack/react-router";

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { Hero } from "~/components/landing/hero";
import { OutputPreview } from "~/components/landing/output-preview";
import { Audience, PrivacyFold } from "~/components/landing/marketing-folds";
import { CLIFold } from "~/components/landing/cli-fold";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat. Combine files for any AI.",
        description:
          "Drop a folder or pipe a directory into the CLI. Get one structured file ChatGPT, Claude, and Gemini can read. Runs in your browser or your terminal, with PDF and DOCX extraction.",
        url: "https://fileconcat.com",
      }),
      {
        name: "keywords",
        content:
          "file concat, combine files, LLM, ChatGPT, Claude, Gemini, AI assistant, code sharing, GitHub import, token counter, npm cli, pdf extract, docx extract",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com" }],
  }),
});

function LandingPage() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <OutputPreview />
        <Audience />
        <CLIFold />
        <PrivacyFold />
      </main>
      <SiteFooter />
    </div>
  );
}
