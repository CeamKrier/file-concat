import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";

import { ContextWindowCosts } from "./context-window-costs";
import { FormatsTable } from "./formats-table";
import { baseMdxComponents } from "./mdx-components";

/**
 * The docs prose system: the shared MDX element styles, plus the data blocks a
 * reference page needs. No blog-only elements.
 *
 * `ContextWindowCosts` renders the model catalogue, so it loads eagerly and
 * renders server-side: its numbers are the part a crawler is meant to lift, and
 * a lazy chunk would hide them. `FormatsTable` is the same kind of block: the
 * list of what the tab reads, rendered from `~/data/formats`.
 */
const docsComponents = {
  ...baseMdxComponents,
  ContextWindowCosts,
  FormatsTable,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

/** The docs prose provider. */
export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={docsComponents}>{children}</MDXProvider>;
}
