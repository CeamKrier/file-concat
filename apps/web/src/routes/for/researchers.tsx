import { createFileRoute } from "@tanstack/react-router";

import { ResearchersPage } from "~/components/personas/researchers-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/for/researchers")({
  component: ResearchersPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "A folder of papers into one context window",
        description:
          "Drop the PDFs, your notes, and the data. The text is extracted in your browser and the tokens counted, so you know the whole pile fits before you paste.",
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
