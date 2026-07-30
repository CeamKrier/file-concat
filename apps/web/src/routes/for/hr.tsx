import { createFileRoute } from "@tanstack/react-router";

import { HR_FAQ } from "~/components/personas/hr-faq";
import { HrPage } from "~/components/personas/hr-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HR_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/hr")({
  component: HrPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat for HR. Combine policies and CVs for AI, privately.",
        description:
          "Drop a policy set or a batch of CVs. FileConcat reads the PDFs and Word files in your browser and returns one file for ChatGPT, Claude, or Gemini. Nothing is uploaded, so employee data stays private.",
        url: "https://fileconcat.com/for/hr",
      }),
      {
        name: "keywords",
        content:
          "HR AI, combine CVs for AI, screen resumes with AI, employee handbook AI, HR policy AI, private employee data AI, combine documents for ChatGPT, HR document tool",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/hr" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
