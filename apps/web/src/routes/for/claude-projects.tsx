import { createFileRoute } from "@tanstack/react-router";

import { CLAUDE_PROJECTS_FAQ } from "~/components/personas/claude-projects-faq";
import { ClaudeProjectsPage } from "~/components/personas/claude-projects-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CLAUDE_PROJECTS_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/for/claude-projects")({
  component: ClaudeProjectsPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // Remedy-first title, same call and same reason as its two siblings: a
        // counting question about a vendor's own product is answered by that
        // vendor's documentation, and an AI Overview cites it rather than us.
        //
        // What sets this page apart is that its demand was never a count. GSC for
        // the 30 days to 2026-08-26 shows 474 impressions at position 9.7 for 0.6%
        // CTR, and the queries behind it are the error string Claude prints, pasted
        // in verbatim: "claude project knowledge exceeds maximum", "project
        // knowledge exceeds maximum. remove files to continue". Somebody searching
        // their own error message has already hit the wall this page is about, so
        // the description opens on their words the way /for/notebooklm opens on
        // "Notebook reached the source limit?".
        //
        // An error string carries no figure, which is why it is safe here when a
        // cap is not: Google caches a description and it cannot say how old it is.
        // The caps stay in the dated table below the fold.
        //
        // 2026-09-24: the title now carries the error string itself, the words
        // people search for, which until then only the description and the
        // keywords carried. The description also stopped promising that
        // combining makes a project fit: Claude caps a project by total size, so
        // one file of the same content is the same size. What clears the error is
        // leaving things out, with the count in view.
        title: 'Fix "Project knowledge exceeds maximum" in Claude',
        description:
          "Project knowledge exceeds maximum? See which files fill your Claude project, leave out what it doesn't need, add the rest as one file. Nothing uploaded to us.",
        url: "https://fileconcat.com/for/claude-projects",
      }),
      {
        name: "keywords",
        content:
          "claude project knowledge exceeds maximum, project knowledge exceeds maximum remove files to continue, claude project knowledge limit, claude 20 file limit, claude file upload limit per chat, claude project file limit, add files to claude project, combine files for claude, claude projects context window, claude project size limit, merge pdfs for claude",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/for/claude-projects" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
