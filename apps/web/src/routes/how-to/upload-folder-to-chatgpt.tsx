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
        // chatgpt", "can i upload a folder to chatgpt". ZIP queries have their
        // own page since 2026-10-13 (/how-to/upload-zip-to-chatgpt), so this
        // title no longer competes for them. The description answers the
        // question first and promises the way through second.
        title: "Upload a folder to ChatGPT as one file",
        description:
          "OpenAI describes no way to upload a folder. Drop it here for one text file ChatGPT reads in full, the folder tree at the top. Not uploaded to us.",
        url: "https://fileconcat.com/how-to/upload-folder-to-chatgpt",
      }),
      {
        name: "keywords",
        content:
          "upload folder to chatgpt, can i upload a folder to chatgpt, upload entire folder to chatgpt, upload directory to chatgpt, upload multiple files to chatgpt at once",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/upload-folder-to-chatgpt" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
