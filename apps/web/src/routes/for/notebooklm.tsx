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
        // Same reason as /for/chatgpt-projects: the demand is a counting
        // question and a snippet promising to get you "past the limit" never
        // answers it. The queries reaching this page ask for the number, and
        // for what to do once the notebook refuses another source.
        title: "NotebookLM source limit: how many sources a notebook holds",
        description:
          "A NotebookLM notebook takes 50 sources on the free plan and 100 with a paid one. Reached the cap? Combine a whole research pile, PDFs and Office docs included, into one file that lands as a single source. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/notebooklm",
      }),
      {
        name: "keywords",
        content:
          "notebooklm source limit, notebooklm sources limit, notebook has reached the source limit, how many files can notebooklm handle, notebooklm source limit workaround, add more sources to notebooklm, combine files for notebooklm, notebooklm 50 sources, notebooklm max sources, notebooklm source size limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/notebooklm" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
