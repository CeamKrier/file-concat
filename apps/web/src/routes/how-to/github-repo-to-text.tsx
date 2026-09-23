import { createFileRoute } from "@tanstack/react-router";

import { GITHUB_REPO_FAQ } from "~/components/how-to/github-repo-faq";
import { GithubRepoPage } from "~/components/how-to/github-repo-page";
import { generateSEOMeta } from "~/lib/seo";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: GITHUB_REPO_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export const Route = createFileRoute("/how-to/github-repo-to-text")({
  component: GithubRepoPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        // The searcher's words: "github repo to text", "convert github repo to
        // text file", "github to llm". The description promises the file and
        // the count, and says where the fetch goes, since a pasted URL is the
        // one input here that leaves the tab (to GitHub, never to us).
        title: "GitHub repo to text: one file for any LLM",
        description:
          "Paste a GitHub repo URL and get one text file for ChatGPT or Claude, with the token count first. Your browser fetches it from GitHub; nothing goes to us.",
        url: "https://fileconcat.com/how-to/github-repo-to-text",
      }),
      {
        name: "keywords",
        content:
          "github repo to text, convert github repo to text file, github repository to txt, github repo to llm, github repo to markdown, repo to single file, github to chatgpt, gitingest alternative, how many tokens is a github repo",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/how-to/github-repo-to-text" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(FAQ_SCHEMA) }],
  }),
});
