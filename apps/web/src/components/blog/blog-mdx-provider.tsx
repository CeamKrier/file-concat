import { MDXProvider } from "@mdx-js/react";
import { lazy, Suspense, type ReactNode } from "react";

import { baseMdxComponents } from "~/components/mdx-components";

import { After, Before, BeforeAfter } from "./before-after";
import { Callout } from "./callout";
import { Step, Steps } from "./steps";

// Lazy so the ingestion engine and its dependencies stay out of the docs bundle
// and the article's first SSR chunk. The fallback holds the dropzone's footprint
// to avoid layout shift while the tool hydrates in.
const TryIt = lazy(() => import("./try-it"));

function TryItFallback() {
  return (
    <section className="my-9" aria-hidden="true">
      <div className="rounded-panel border-border-strong bg-surface-alt flex min-h-[228px] items-center justify-center border-2 border-dashed px-6 py-12 text-center">
        <p className="text-ink-faint text-sm">Loading the tool...</p>
      </div>
    </section>
  );
}

/**
 * The blog prose system: the shared MDX element styles plus the rich blog-only
 * elements (Callout, Steps/Step, BeforeAfter/Before/After, TryIt). Registering
 * them here lets posts use `<Callout />`, `<TryIt />`, etc. directly in `.mdx`
 * without an import. Docs keep the plain MDXProviderWrapper, so the tool engine
 * never reaches them.
 */
const blogComponents = {
  ...baseMdxComponents,
  Callout,
  Steps,
  Step,
  BeforeAfter,
  Before,
  After,
  TryIt: (props: { title?: string; hint?: string }) => (
    <Suspense fallback={<TryItFallback />}>
      <TryIt {...props} />
    </Suspense>
  ),
};

export function BlogMDXProviderWrapper({ children }: { children: ReactNode }) {
  return <MDXProvider components={blogComponents}>{children}</MDXProvider>;
}
