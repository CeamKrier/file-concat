import { createFileRoute } from "@tanstack/react-router";

import { ChatGptProjectsPage } from "~/components/personas/chatgpt-projects-page";
import { CHATGPT_PROJECTS_FAQ } from "~/components/personas/chatgpt-projects-faq";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CHATGPT_PROJECTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/chatgpt-projects")({
  component: ChatGptProjectsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Get past the ChatGPT Projects file limit",
        description:
          "Hit the ChatGPT Projects file limit? Combine a whole folder, even PDFs and Office docs, into one file that takes a single Project slot. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/chatgpt-projects",
      }),
      {
        name: "keywords",
        content:
          "chatgpt project file limit, add more files to chatgpt project, chatgpt projects file limit, how many files chatgpt project, combine files for chatgpt, custom gpt knowledge files, chatgpt upload limit, bypass chatgpt file limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/chatgpt-projects" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
