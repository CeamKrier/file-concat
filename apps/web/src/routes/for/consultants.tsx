import { createFileRoute } from "@tanstack/react-router";

import { CONSULTANTS_FAQ } from "~/components/personas/consultants-faq";
import { ConsultantsPage } from "~/components/personas/consultants-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CONSULTANTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/consultants")({
  component: ConsultantsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat for consultants. Turn an engagement into one AI context.",
        description:
          "Drop the decks, reports, and data from a whole engagement. FileConcat reads the slides, PDFs, and spreadsheets in your browser and returns one file for ChatGPT, Claude, or Gemini. Nothing is uploaded.",
        url: "https://fileconcat.com/for/consultants",
      }),
      {
        name: "keywords",
        content:
          "consulting AI, combine slide decks for AI, PowerPoint to LLM, engagement documents AI, analyze client documents with AI, consultant document tool, merge reports for ChatGPT, private client AI",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/consultants" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
