import { createFileRoute } from "@tanstack/react-router";

import { GEMINI_GEMS_FAQ } from "~/components/personas/gemini-gems-faq";
import { GeminiGemsPage } from "~/components/personas/gemini-gems-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: GEMINI_GEMS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/gemini-gems")({
  component: GeminiGemsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Get past the Gemini Gems knowledge limit",
        description:
          "Hit the Gemini Gems knowledge limit? Combine a whole folder into one file that takes a single knowledge slot. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/gemini-gems",
      }),
      {
        name: "keywords",
        content:
          "gemini gem file limit, gemini gems knowledge files, add files to gemini gem, combine files for gemini, gemini gem limit, gemini knowledge limit, gemini file upload limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/gemini-gems" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
