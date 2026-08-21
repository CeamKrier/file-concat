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
        // Titled as the question, and answered in the first clause of the
        // description, because the demand this page actually draws is a
        // counting one: the queries reaching it are phrasings of "how many
        // sources can you add to a ChatGPT project". A snippet that opens by
        // promising to get you "past the limit" never states the number the
        // question asked for, and the number itself was three sections down.
        title: "ChatGPT Projects file limit: how many files a Project holds",
        description:
          "A ChatGPT Project holds 5 files on Free, 25 on Plus and 40 on Pro. Hit the cap? Combine a whole folder, PDFs and Office docs included, into one file that takes a single Project slot. Read in your browser, nothing uploaded.",
        url: "https://fileconcat.com/for/chatgpt-projects",
      }),
      {
        name: "keywords",
        content:
          "chatgpt project file limit, chatgpt project sources limit, how many sources can you add to a chatgpt project, add more files to chatgpt project, chatgpt projects file limit, how many files chatgpt project, combine files for chatgpt, custom gpt knowledge files, chatgpt upload limit, bypass chatgpt file limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/chatgpt-projects" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
