import { createFileRoute } from "@tanstack/react-router";

import { NOTEBOOKLM_FAQ } from "~/components/personas/notebooklm-faq";
import { NotebookLmPage } from "~/components/personas/notebooklm-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: NOTEBOOKLM_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/notebooklm")({
  component: NotebookLmPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Get past the NotebookLM source limit",
        description:
          "Hit the NotebookLM source limit? Combine a whole research pile, even PDFs and Office docs, into one file that lands as a single source. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/notebooklm",
      }),
      {
        name: "keywords",
        content:
          "notebooklm source limit, notebooklm source limit workaround, add more sources to notebooklm, combine files for notebooklm, notebooklm 50 sources, notebooklm max sources, notebooklm source size limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/notebooklm" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
