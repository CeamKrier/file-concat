import { createFileRoute } from "@tanstack/react-router";

import { EXPORT_CONVERSATION_FAQ } from "~/components/how-to/export-conversation-faq";
import { ExportConversationPage } from "~/components/how-to/export-conversation-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: EXPORT_CONVERSATION_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/export-chatgpt-conversation-to-markdown")({
  component: ExportConversationPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher wants one chat out as a file, and the vendors' own
        // exports are whole-account ZIPs by email. Claude is in the title
        // because its autocomplete runs as high as ChatGPT's.
        title: "Export a ChatGPT or Claude conversation to Markdown",
        description:
          "Save one ChatGPT, Claude or Gemini conversation as Markdown, every turn, without the account export. A free Chrome side panel. Not uploaded to us.",
        url: "https://fileconcat.com/how-to/export-chatgpt-conversation-to-markdown",
      }),
      {
        name: "keywords",
        content:
          "export chatgpt conversation to markdown, export chatgpt chat, save chatgpt conversation as markdown, export claude conversation to markdown, export claude chat, chatgpt to markdown, chatgpt conversation to obsidian, export single chatgpt conversation, export gemini conversation",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://fileconcat.com/how-to/export-chatgpt-conversation-to-markdown",
      },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
