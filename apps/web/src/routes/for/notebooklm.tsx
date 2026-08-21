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
        // Same call as /for/chatgpt-projects, for the same reason: a counting
        // question about a vendor's own product is answered by that vendor's
        // documentation, and an AI Overview cites it rather than us. The half
        // worth claiming is the one the count leaves behind, which for this
        // page is a notebook that has just refused another source.
        title: "Get past the NotebookLM source limit",
        description:
          "Hit the NotebookLM source limit? Combine a whole research pile, even PDFs and Office docs, into one file that lands as a single source. A notebook takes 50 sources on the free plan and 300 with a paid one. Read in your browser, nothing uploaded.",
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
