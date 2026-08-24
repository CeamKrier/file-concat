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
        title: "How to share all your files with an AI at once",
        description:
          "Combine a whole folder, PDFs and Office docs included, into one file that ChatGPT, Claude, Gemini, or NotebookLM takes in one slot. Nothing is uploaded.",
        url: "https://fileconcat.com/how-to/share-all-files-with-ai",
      }),
      {
        name: "keywords",
        content:
          "share all files with AI, combine files for ChatGPT, chatgpt file limit, add more files to chatgpt project, merge PDFs for Claude, NotebookLM sources, Gemini Gems files, upload limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/share-all-files-with-ai" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
