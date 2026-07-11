import { MDXProvider } from "@mdx-js/react";
import type { ReactNode } from "react";

import { baseMdxComponents } from "./mdx-components";

interface MDXProviderWrapperProps {
  children: ReactNode;
}

/** The docs prose provider: shared MDX element styles, no blog-only elements. */
export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={baseMdxComponents}>{children}</MDXProvider>;
}
