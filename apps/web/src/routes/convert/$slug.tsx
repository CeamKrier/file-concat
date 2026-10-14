import { createFileRoute, notFound } from "@tanstack/react-router";

import { convertFormatBySlug } from "~/components/convert/convert-formats";
import { ConvertPage } from "~/components/convert/convert-page";
import { generateSEOMeta } from "~/lib/seo";

export const Route = createFileRoute("/convert/$slug")({
  component: ConvertRoute,
  loader: ({ params }) => {
    if (!convertFormatBySlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const format = convertFormatBySlug(params.slug);
    // `head` still runs for a slug the loader rejects; emit nothing for it.
    if (!format) return {};
    const url = `https://fileconcat.com/convert/${format.slug}`;
    return {
      meta: [
        ...generateSEOMeta({ title: format.meta.title, description: format.meta.description, url }),
        { name: "keywords", content: format.meta.keywords },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: format.faq.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        },
      ],
    };
  },
});

function ConvertRoute() {
  const { slug } = Route.useParams();
  const format = convertFormatBySlug(slug);
  if (!format) throw notFound();
  return <ConvertPage format={format} />;
}
