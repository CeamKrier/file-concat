import { createFileRoute } from "@tanstack/react-router";

import { CHATGPT_CONVERSATION_TOO_LONG_FAQ } from "~/components/how-to/chatgpt-conversation-too-long-faq";
import { ChatgptConversationTooLongPage } from "~/components/how-to/chatgpt-conversation-too-long-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CHATGPT_CONVERSATION_TOO_LONG_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/chatgpt-conversation-too-long")({
  component: ChatgptConversationTooLongPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher has hit the end of one conversation: "chatgpt conversation
        // too long", "maximum length for this conversation", "continue chatgpt
        // conversation in new chat". The remedy is the Clipper, so the
        // description names it.
        title: "ChatGPT conversation too long? Carry it into a new chat",
        description:
          "Hit the maximum length for a ChatGPT conversation? A free Chrome side panel reads every turn and hands it back as one file to attach to a new chat. Nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/chatgpt-conversation-too-long",
      }),
      {
        name: "keywords",
        content:
          "chatgpt conversation too long, you've reached the maximum length for this conversation, this conversation is too long please start a new one, chatgpt maximum conversation length, continue chatgpt conversation in new chat, export chatgpt conversation, chatgpt chat length limit",
      },
    ],
    links: [
      { rel: "canonical", href: "https://fileconcat.com/how-to/chatgpt-conversation-too-long" },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
