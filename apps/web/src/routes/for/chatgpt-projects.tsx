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
        // The title stays on the remedy, deliberately, after looking at the
        // SERP for the counting queries this page draws. Google answers them
        // with an AI Overview that lists every tier and cites OpenAI's own help
        // centre, which is not a citation anyone outranks: it is the vendor
        // documenting its own product. Competing for the count there wins
        // neither the click nor the mention.
        //
        // What that overview does *not* name is anyone who solves the problem
        // it leaves behind. It ends by offering to help "combine your
        // documents" and cites nobody for it, and OpenAI's own FAQ answers "what
        // happens if I hit my file limit" with "combine file data". That is the
        // sentence this page exists to be the answer to, so the title claims it
        // and the numbers ride along in the description as supporting fact.
        title: "Get past the ChatGPT Projects file limit",
        description:
          "Hit the ChatGPT Projects file limit? Combine a whole folder, even PDFs and Office docs, into one file that takes a single Project slot. A Project holds 5 files on Free, 25 on Go and Plus, and 40 on Pro, Edu, Business and Enterprise. Read in your browser, nothing uploaded.",
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
