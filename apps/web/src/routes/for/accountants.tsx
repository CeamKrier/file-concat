import { createFileRoute } from "@tanstack/react-router";

import { ACCOUNTANTS_FAQ } from "~/components/personas/accountants-faq";
import { AccountantsPage } from "~/components/personas/accountants-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ACCOUNTANTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/accountants")({
  component: AccountantsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat for accountants. Combine a client file for AI, privately.",
        description:
          "Drop a folder of statements, ledgers, and invoices. FileConcat reads the PDFs and spreadsheets in your browser and returns one file for ChatGPT, Claude, or Gemini. Nothing is uploaded, so client data stays private.",
        url: "https://fileconcat.com/for/accountants",
      }),
      {
        name: "keywords",
        content:
          "accounting AI, combine financial statements for AI, read bank statements with AI, spreadsheet to LLM, confidential client data AI, accountant document tool, tax documents AI, private financial AI",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/accountants" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
