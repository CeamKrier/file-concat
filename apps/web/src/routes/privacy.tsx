import { createFileRoute } from "@tanstack/react-router";

import { PrivacyPage } from "~/components/privacy-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Privacy",
        description:
          "What leaves your device and what doesn't. FileConcat reads and combines your files in the browser, so they are never uploaded to be processed. A plain account of what we collect, and how to check it yourself.",
        url: "https://fileconcat.com/privacy",
      }),
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/privacy" }],
  }),
});
