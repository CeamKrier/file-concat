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
        // Same rule as /for/chatgpt-projects: no figures in a meta description,
        // because it cannot carry the snapshot date and the link that make a
        // vendor's number safe to state.
        // 2026-09-24: the refusal's own words lead ("reached the source limit"),
        // since that family arrives mid-problem and the count questions do not
        // click; GitHub repo into NotebookLM has a section and a keyword.
        title: "NotebookLM source limit reached? Add more as one source",
        description:
          "Notebook reached the source limit? Combine your documents, or a GitHub repo, into one text file NotebookLM adds as a single source. Nothing uploaded to us.",
        url: "https://fileconcat.com/for/notebooklm",
      }),
      {
        name: "keywords",
        content:
          "notebooklm source limit, notebooklm sources limit, notebook has reached the source limit, how many files can notebooklm handle, notebooklm source limit workaround, add more sources to notebooklm, combine files for notebooklm, notebooklm 50 sources, notebooklm max sources, notebooklm source size limit, notebooklm file size limit, github repo to notebooklm, add github repository to notebooklm",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/notebooklm" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
