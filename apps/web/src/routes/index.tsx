import { createFileRoute } from "@tanstack/react-router";

import { AppFlow } from "~/components/app/app-flow";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat. Combine files into one AI-ready document.",
        description:
          "Drop a folder, files, or a zip. The noise gets stripped and out comes one clean document for ChatGPT, Claude, or Gemini. Runs in your browser, no setup, no account, nothing uploaded.",
        url: "https://fileconcat.com",
      }),
      {
        name: "keywords",
        content:
          "file concat, combine files, LLM, ChatGPT, Claude, Gemini, AI assistant, code sharing, GitHub import, token counter, npm cli",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com" }],
  }),
});

function LandingPage() {
  return <AppFlow />;
}
