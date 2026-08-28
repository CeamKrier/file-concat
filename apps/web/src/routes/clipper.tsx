import { createFileRoute } from "@tanstack/react-router";

import { ClipperPage } from "~/components/clipper/clipper-page";
import { generateSEOMeta } from "~/lib/seo";

/**
 * /clipper — the extension's own page, and the URL the Chrome Web Store listing
 * should carry as its homepage. Until this existed the listing pointed at
 * fileconcat.com, which says nothing about a clipper, so the one link a store
 * visitor is offered went somewhere that could not follow up on the listing.
 *
 * The description leads on threads for the same reason the store summary does:
 * page-to-Markdown is the commodity half and every bookmarklet does it, while a
 * discussion arriving with its nesting intact is the half nothing else offers.
 * No figures in the meta description; the measured ones live on the page, where
 * they can carry their source.
 */
export const Route = createFileRoute("/clipper")({
  component: ClipperPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "FileConcat Clipper: save threads and articles as Markdown",
        description:
          "A browser side panel that saves Reddit and Hacker News threads, YouTube transcripts and any article as Markdown, straight into one bundle for ChatGPT or Claude. Free and open source.",
        url: "https://fileconcat.com/clipper",
      }),
      {
        name: "keywords",
        content:
          "save reddit thread as markdown, export reddit thread, save hacker news thread, youtube transcript to markdown, web clipper for chatgpt, web clipper for claude, save web page as markdown, article to markdown chrome extension, clip pages for llm",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/clipper" }],
  }),
});
