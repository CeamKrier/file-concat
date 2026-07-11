import { createFileRoute } from "@tanstack/react-router";

import { AppFlow } from "~/components/app/app-flow";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "File concat tool. Combine files into one.",
        description:
          "Free file concat tool. Combine files, a folder, or a repo into one clean document for ChatGPT, Claude, or Gemini. In your browser, nothing uploaded.",
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
