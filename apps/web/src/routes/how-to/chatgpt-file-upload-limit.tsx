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
        // description promises the way past it. Since 2026-10-26 the
        // description also names the quota, as the setup for the way past it,
        // because the page ranked on the first page but drew few clicks
        // without one. A cached snippet can lag a quota change by weeks: on a DRIFT
        // line in check-vendor-caps, fix this string first. Read the CTR
        // against the prior period around 2026-11-23 and revert if it did not
        // move. The Claude limit page runs the same test.
        title: "Get past the ChatGPT file upload limit",
        description:
          "Over ChatGPT's 80 files every 3 hours, or 3 a day on Free? Combine a whole folder, PDFs included, into one file and it counts as one upload. Not uploaded to us.",
        url: "https://fileconcat.com/how-to/chatgpt-file-upload-limit",
      }),
      {
        name: "keywords",
        content:
          "chatgpt file upload limit, you've reached your file upload limit, chatgpt file upload limit reset, chatgpt file upload limit per day, chatgpt upload limit free, chatgpt upload limit reached, how to get around chatgpt file upload limit, upload multiple files to chatgpt, how many pdfs can i upload to chatgpt, chatgpt pdf upload limit",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/chatgpt-file-upload-limit" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
