import { createFileRoute } from "@tanstack/react-router";
import App from "~/app";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/")({
  component: IndexPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat - Combine Files for AI Assistants",
        description:
          "Free, offline tool to combine multiple files and folders into a single document optimized for ChatGPT, Claude, Gemini and other LLMs. Import from GitHub, GitLab, or drag & drop. 100% privacy - files never leave your browser.",
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

function IndexPage() {
  return <App />;
}
