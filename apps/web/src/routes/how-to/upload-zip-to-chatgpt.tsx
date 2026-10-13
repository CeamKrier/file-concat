import { createFileRoute } from "@tanstack/react-router";

import { UPLOAD_ZIP_FAQ } from "~/components/how-to/upload-zip-faq";
import { UploadZipPage } from "~/components/how-to/upload-zip-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: UPLOAD_ZIP_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/upload-zip-to-chatgpt")({
  component: UploadZipPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher asks a yes-or-no question ("can I upload a zip file to
        // chatgpt", "can chatgpt read zip files"), so the title repeats it and
        // the description answers both halves before it promises the way through.
        title: "Can you upload a ZIP file to ChatGPT?",
        description:
          "Yes, but ChatGPT must unpack it first, and OpenAI says that can fail. Drop the ZIP here for one text file it reads in full. Nothing is uploaded to us.",
        url: "https://fileconcat.com/how-to/upload-zip-to-chatgpt",
      }),
      {
        name: "keywords",
        content:
          "can i upload a zip file to chatgpt, can chatgpt read zip files, upload zip to chatgpt, chatgpt can't open zip, can claude read zip files, can gemini read zip files, zip file to text for chatgpt",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/upload-zip-to-chatgpt" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
