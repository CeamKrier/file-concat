import { createFileRoute } from "@tanstack/react-router";

import { UPLOAD_FOLDER_FAQ } from "~/components/how-to/upload-folder-faq";
import { UploadFolderPage } from "~/components/how-to/upload-folder-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: UPLOAD_FOLDER_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/upload-folder-to-chatgpt")({
  component: UploadFolderPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher's words, in the order they type them: "upload folder to
        // chatgpt", "can chatgpt read zip files", "can't upload zip to
        // chatgpt". The description answers the question first and promises
        // the way through second.
        title: "Upload a folder or ZIP to ChatGPT",
        description:
          "Can't upload a folder to ChatGPT, or it won't read your ZIP? Drop either here for one text file it reads in full. Nothing is uploaded to us.",
        url: "https://fileconcat.com/how-to/upload-folder-to-chatgpt",
      }),
      {
        name: "keywords",
        content:
          "upload folder to chatgpt, can chatgpt read zip files, upload zip to chatgpt, can't upload zip to chatgpt, upload entire folder to chatgpt, upload directory to chatgpt, upload multiple files to chatgpt at once, chatgpt cannot read zip file",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/upload-folder-to-chatgpt" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
