import { createFileRoute } from "@tanstack/react-router";

import { GITINGEST_ALTERNATIVE_FAQ } from "~/components/how-to/gitingest-alternative-faq";
import { GitingestAlternativePage } from "~/components/how-to/gitingest-alternative-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: GITINGEST_ALTERNATIVE_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/gitingest-alternative")({
  component: GitingestAlternativePage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher's words: "gitingest alternative", "repomix alternative",
        // "is repomix safe", "repomix pdf". The description names the two
        // differences they are weighing, where the code goes and whether a
        // document is read, and holds our claim to "nothing uploaded to us".
        title: "A gitingest and Repomix alternative, in your browser",
        description:
          "A gitingest and Repomix alternative that reads your folder or GitHub repo in the browser, PDFs and Word files included, into one file. Nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/gitingest-alternative",
      }),
      {
        name: "keywords",
        content:
          "gitingest alternative, repomix alternative, is repomix safe, repomix privacy, repomix pdf, gitingest private repo, local gitingest, repomix online, codebase to text in browser",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/gitingest-alternative" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
