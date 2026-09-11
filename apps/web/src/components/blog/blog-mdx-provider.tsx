import { MDXProvider } from "@mdx-js/react";
import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

import { baseMdxComponents } from "~/components/mdx-components";
import type { BlogSection } from "~/lib/blog";

import { Bars, type BarsProps } from "./bars";
import { After, Before, BeforeAfter } from "./before-after";
import { Callout } from "./callout";
import { Checklist } from "./checklist";
import { CompositionBar } from "./composition-bar";
import { Contents, OutlineProvider } from "./contents";
import { ContextFunnel } from "./context-funnel";
import { FitCurve } from "./fit-curve";
import { KeyFindings } from "./key-findings";
import { Method } from "./method";
import { PaneDiff } from "./pane-diff";
import { Payoff } from "./payoff";
import { PresenceTable } from "./presence-table";
import { ReaderDuel } from "./reader-duel";
import { SectionBoundary } from "./section-boundary";
import { StatusGrid } from "./status-grid";
import { Step, Steps } from "./steps";
import { Stopper } from "./stopper";
import { StudyTable } from "./study-table";
import type { TryItProps } from "./try-it";
import { UnitFlip } from "./unit-flip";

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
 * The blog prose system: the shared MDX element styles, the long-form reading
 * system, and the research figures.
 *
 * Two elements are overridden rather than styled in place. `h2` becomes a
 * section boundary, because a 3,000 word article needs a break a fast scroller
 * can see and a larger font is not one. The first paragraph of each section
 * becomes its summary line; `scripts/remark-blog-sections.mjs` marks it, so a
 * writer gets both from plain Markdown with nothing to remember.
 *
 * The research figures are static markup with no engine dependency, so unlike
 * TryIt they load eagerly and render server-side: their numbers are the part an
 * AI crawler is meant to lift, and a lazy chunk would hide them.
 */
const blogComponents = {
  ...baseMdxComponents,
  h2: SectionBoundary,
  p: ({ children, ...rest }: ComponentProps<"p"> & { "data-lede"?: string }) =>
    rest["data-lede"] ? (
      <p className="text-ink mb-6 max-w-[52ch] text-[16.5px] leading-[1.5]">{children}</p>
    ) : (
      <p
        className="text-ink-secondary mb-5 max-w-[68ch] text-[15.5px] leading-[1.7]"
        style={{ textWrap: "pretty" }}
      >
        {children}
      </p>
    ),
  Callout,
  Steps,
  Step,
  BeforeAfter,
  Before,
  After,
  Contents,
  Stopper,
  KeyFindings,
  ContextFunnel,
  CompositionBar,
  Bars: (props: BarsProps) => <Bars className="my-8" {...props} />,
  Method,
  Payoff,
  FitCurve,
  UnitFlip,
  StatusGrid,
  PresenceTable,
  ReaderDuel,
  PaneDiff,
  Checklist,
  StudyTable,
  TryIt: (props: TryItProps) => (
    <Suspense fallback={<TryItFallback />}>
      <TryIt {...props} />
    </Suspense>
  ),
};

export function BlogMDXProviderWrapper({
  children,
  sections = [],
  readingMinutes = 0,
}: {
  children: ReactNode;
  sections?: BlogSection[];
  readingMinutes?: number;
}) {
  return (
    <OutlineProvider value={{ sections, readingMinutes }}>
      <MDXProvider components={blogComponents}>{children}</MDXProvider>
    </OutlineProvider>
  );
}
