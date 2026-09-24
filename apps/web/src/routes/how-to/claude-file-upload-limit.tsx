import { createFileRoute } from "@tanstack/react-router";

import { CLAUDE_UPLOAD_LIMIT_FAQ } from "~/components/how-to/claude-upload-limit-faq";
import { ClaudeUploadLimitPage } from "~/components/how-to/claude-upload-limit-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CLAUDE_UPLOAD_LIMIT_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/claude-file-upload-limit")({
  component: ClaudeUploadLimitPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher has hit the cap on files in one chat: "claude file upload
        // limit", "claude 20 file limit", "per chat". /for/claude-projects owns
        // the project error and keeps it. No figures here, same call as
        // /how-to/chatgpt-file-upload-limit: a cached title or description
        // cannot carry the date the cap was read, so the numbers live on the
        // page next to it.
        title: "Get past the Claude file upload limit per chat",
        description:
          "Hit Claude's file limit in a chat? It counts files, so a whole folder or GitHub repo, PDFs included, can go in as one attachment. Read in your browser, nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/claude-file-upload-limit",
      }),
      {
        name: "keywords",
        content:
          "claude file upload limit, claude file upload limit per chat, claude 20 file limit, claude upload limit, claude max files per chat, claude your message will exceed the length limit for this chat, claude pdf 1000 pages, upload multiple files to claude",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/claude-file-upload-limit" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
