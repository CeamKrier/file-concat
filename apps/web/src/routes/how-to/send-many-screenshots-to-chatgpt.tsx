import { createFileRoute } from "@tanstack/react-router";

import { SCREENSHOTS_FAQ } from "~/components/how-to/screenshots-faq";
import { ScreenshotsPage } from "~/components/how-to/screenshots-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: SCREENSHOTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/send-many-screenshots-to-chatgpt")({
  component: ScreenshotsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher has a pile of screenshots and an image cap in the way:
        // "too many screenshots", "how many images can I send". No figures in
        // the description, same call as the upload-limit pages: it cannot carry
        // the date the caps were read.
        title: "Too many screenshots for ChatGPT or Claude? Send one file",
        description:
          "Hit the image limit? Read the text out of every screenshot in your browser and send it to ChatGPT or Claude as one file. Not uploaded to us.",
        url: "https://fileconcat.com/how-to/send-many-screenshots-to-chatgpt",
      }),
      {
        name: "keywords",
        content:
          "too many screenshots for chatgpt, how many screenshots can i send to chatgpt, how many images can i upload to claude, claude image limit, chatgpt image upload limit, send multiple screenshots to chatgpt, screenshots to text for chatgpt, combine screenshots into one file",
      },
    ],
    links: [
      { rel: "canonical", href: "https://fileconcat.com/how-to/send-many-screenshots-to-chatgpt" },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
