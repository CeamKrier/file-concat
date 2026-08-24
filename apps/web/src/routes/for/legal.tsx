import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "~/components/personas/legal-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/for/legal")({
  component: LegalPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Bundle a case file for AI, privately",
        description:
          "Drop a folder of contracts, filings, and rulings. The PDFs and Word files are read in your browser, never uploaded, and packed into one document.",
        url: "https://fileconcat.com/for/legal",
      }),
      {
        name: "keywords",
        content:
          "legal AI, case file to ChatGPT, read contracts with AI, PDF to LLM, confidential document AI, legal document bundler, privilege, lawyers",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/legal" }],
  }),
});
