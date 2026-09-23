import { createFileRoute } from "@tanstack/react-router";

import { CHATGPT_UPLOAD_LIMIT_FAQ } from "~/components/how-to/chatgpt-upload-limit-faq";
import { ChatGptUploadLimitPage } from "~/components/how-to/chatgpt-upload-limit-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CHATGPT_UPLOAD_LIMIT_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/chatgpt-file-upload-limit")({
  component: ChatGptUploadLimitPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher has already hit the quota: "chatgpt file upload limit",
        // the refusal "you've reached your file upload limit", and "reset"
        // or "per day" variants. Remedy words ("merge files for chatgpt")
        // return no autocomplete at all, so the title carries the limit and the
        // description promises the way past it. No figures here, same call as
        // /for/chatgpt-projects: a cached description cannot carry the date the
        // quota was read, so the numbers live on the page next to it.
        title: "Get past the ChatGPT file upload limit",
        description:
          "Reached your file upload limit? ChatGPT counts files, so a whole folder, PDFs included, can go in as one upload. Read in your browser, nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/chatgpt-file-upload-limit",
      }),
      {
        name: "keywords",
        content:
          "chatgpt file upload limit, you've reached your file upload limit, chatgpt file upload limit reset, chatgpt file upload limit per day, chatgpt upload limit free, chatgpt upload limit reached, how to get around chatgpt file upload limit, upload multiple files to chatgpt",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/chatgpt-file-upload-limit" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
