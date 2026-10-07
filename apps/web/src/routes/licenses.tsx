import { createFileRoute } from "@tanstack/react-router";

import { LicensesPage } from "~/components/licenses-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/licenses")({
  component: LicensesPage,
  head: () => ({
    meta: [
      ...generateSEOMeta({
        title: "Licenses",
        description:
          "The open-source libraries inside FileConcat's PDF, Office and archive readers, their licenses, and where to get the source code.",
        url: "https://fileconcat.com/licenses",
      }),
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/licenses" }],
  }),
});
