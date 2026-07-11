import { createFileRoute } from "@tanstack/react-router";

import { AppFlow } from "~/components/app/app-flow";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "File concat tool. Combine files for an LLM",
        description:
          "Free file concat tool. Turn a folder or repo into one LLM-ready document for ChatGPT or Claude. In your browser, nothing uploaded, live token counts.",
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
