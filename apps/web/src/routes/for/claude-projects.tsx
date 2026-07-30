import { createFileRoute } from "@tanstack/react-router";

import { CLAUDE_PROJECTS_FAQ } from "~/components/personas/claude-projects-faq";
import { ClaudeProjectsPage } from "~/components/personas/claude-projects-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CLAUDE_PROJECTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/claude-projects")({
  component: ClaudeProjectsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Get past the Claude Projects knowledge limit",
        description:
          "Claude Project knowledge full? Combine a whole folder, even PDFs and Office docs, into one file and see the token count before you add it. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/claude-projects",
      }),
      {
        name: "keywords",
        content:
          "claude project knowledge limit, claude project file limit, add files to claude project, combine files for claude, claude projects context window, claude project size limit, merge pdfs for claude",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/claude-projects" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
