import { createFileRoute } from "@tanstack/react-router";

import { FAQ_ITEMS } from "~/components/how-to/faq-data";
import { ShareAllFilesPage } from "~/components/how-to/share-all-files-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/share-all-files-with-ai")({
  component: ShareAllFilesPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // Retitled 2026-09-24 from "How to share all your files with an AI at
        // once": nobody types the remedy, they type the limit. The page is the
        // hub every limit page links from, and a title of its own gives it a
        // second chance at its own canonical. No figures in the description,
        // same call as the limit pages: the dated table carries them.
        title: "AI file upload limits: ChatGPT, Claude, Gemini, NotebookLM",
        description:
          "Every file upload limit in ChatGPT, Claude, Gemini and NotebookLM in one dated, sourced table, and a way past each one. Nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/share-all-files-with-ai",
      }),
      {
        name: "keywords",
        content:
          "ai file upload limits, chatgpt file upload limit, claude file upload limit, gemini file upload limit, notebooklm source limit, how many files can i upload to chatgpt, how many files can i upload to claude, share all files with AI, combine files for ChatGPT",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/share-all-files-with-ai" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
