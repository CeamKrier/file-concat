import { createFileRoute } from "@tanstack/react-router";

import { ResearchersPage } from "~/components/personas/researchers-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/for/researchers")({
  component: ResearchersPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat for researchers. A folder of papers into one context window.",
        description:
          "Drop the PDFs, your notes, and the data. FileConcat extracts the text in your browser, packs it into one document, and counts the tokens so you know a whole reading pile fits ChatGPT, Claude, or Gemini before you paste.",
        url: "https://fileconcat.com/for/researchers",
      }),
      {
        name: "keywords",
        content:
          "research AI, papers to ChatGPT, literature review AI, PDF to LLM, feed papers to Claude, token counter, context window, academic PDF bundler",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/researchers" }],
  }),
});
