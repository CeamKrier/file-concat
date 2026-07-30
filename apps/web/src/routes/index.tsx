import { createFileRoute } from "@tanstack/react-router";

import { AppFlow } from "~/components/app/app-flow";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Combine files for ChatGPT, Claude & Gemini",
        description:
          "Hit the file limit on ChatGPT, Claude, or Gemini? Combine all your files, even PDFs and Office docs, into one. It all runs in your browser, nothing uploaded.",
        url: "https://fileconcat.com",
      }),
      {
        name: "keywords",
        content:
          "combine files, merge files, combine files for AI, chatgpt file limit, ai file upload limit, combine files for ChatGPT, combine files for Claude, merge PDFs for AI, combine Word documents, NotebookLM sources, GitHub import",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com" }],
  }),
});

function LandingPage() {
  return <AppFlow />;
}
