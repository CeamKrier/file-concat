import { createFileRoute } from "@tanstack/react-router";

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { Hero } from "~/components/landing/hero";
import { OutputPreview } from "~/components/landing/output-preview";
import { Audience, CLIFold, PrivacyFold } from "~/components/landing/marketing-folds";
import { generateSEOMeta } from "~/lib/seo";

const CLI_ENABLED = false;

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat. Combine files for any AI.",
        description:
          "Drop a folder, get a single structured file ChatGPT, Claude, and Gemini can read. Runs entirely in your browser.",
        url: "https://fileconcat.com",
      }),
      {
        name: "keywords",
        content:
          "file concat, combine files, LLM, ChatGPT, Claude, Gemini, AI assistant, code sharing, GitHub import, token counter",
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
        <PrivacyFold />
        {CLI_ENABLED ? <CLIFold /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}
