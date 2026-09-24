import { createFileRoute } from "@tanstack/react-router";

import { UPLOAD_BOOK_FAQ } from "~/components/how-to/upload-book-faq";
import { UploadBookPage } from "~/components/how-to/upload-book-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: UPLOAD_BOOK_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/upload-book-to-chatgpt")({
  component: UploadBookPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher's words: "upload book to chatgpt", "upload textbook to
        // chatgpt", "can chatgpt read epub". The description asks their question
        // and promises the file; the caps stay on the page next to their date.
        title: "Upload a book or textbook to ChatGPT (EPUB, PDF)",
        description:
          "ChatGPT won't take your EPUB, or the textbook is too long? Drop the EPUB or PDF here for one text file with its token count. Nothing uploaded to us.",
        url: "https://fileconcat.com/how-to/upload-book-to-chatgpt",
      }),
      {
        name: "keywords",
        content:
          "upload book to chatgpt, upload textbook to chatgpt, can chatgpt read epub, upload epub to chatgpt, upload pdf book to chatgpt, upload book to claude, add book to notebooklm, epub to text",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/upload-book-to-chatgpt" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
