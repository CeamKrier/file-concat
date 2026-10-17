import { createFileRoute } from "@tanstack/react-router";

import { BenchmarksPage } from "~/components/benchmarks-page";
import { LAST_MEASURED } from "~/lib/benchmarks";
import { generateSEOMeta } from "~/lib/seo";

const URL = "https://fileconcat.com/benchmarks";

/**
 * One URL for the current numbers, updated in place. Google asks for a
 * visible "updated" date that matches `dateModified`, and both come from the
 * newest `measured` in `src/data/benchmarks.json`. No canonical from the
 * studies to here: they are not duplicates, and none of the benchmark sites
 * we read does it.
 */
export const Route = createFileRoute("/benchmarks")({
  component: BenchmarksPage,
  head: () => ({
    meta: generateSEOMeta({
      title: "FileConcat benchmarks: document, PDF, web page and code extraction",
      description:
        "FileConcat against Tika, markitdown, Repomix, gitingest and other tools: document coverage, PDF, saved web pages, archives and code bundles, each at the version it measured.",
      url: URL,
    }),
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        // `<` escaped so no value can close the script element.
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "FileConcat benchmarks",
          url: URL,
          datePublished: "2026-10-17",
          dateModified: LAST_MEASURED,
        }).replace(/</g, "\\u003c"),
      },
    ],
  }),
});
