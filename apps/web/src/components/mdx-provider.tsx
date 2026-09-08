import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";

import { ContextWindowCosts } from "./context-window-costs";
import { baseMdxComponents } from "./mdx-components";

/**
 * The docs prose system: the shared MDX element styles, plus the data blocks a
 * reference page needs. No blog-only elements.
 *
 * `ContextWindowCosts` renders the model catalogue, so it loads eagerly and
 * renders server-side: its numbers are the part a crawler is meant to lift, and
 * a lazy chunk would hide them.
 */
const docsComponents = {
  ...baseMdxComponents,
  ContextWindowCosts,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

/** The docs prose provider. */
export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={docsComponents}>{children}</MDXProvider>;
}
