import { MDXProvider } from "@mdx-js/react";
import type { ComponentProps, ReactNode } from "react";

const components = {
  h1: (props: ComponentProps<"h1">) => <h1 className="mb-4 mt-8 text-3xl font-bold" {...props} />,
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mb-3 mt-6 text-2xl font-semibold" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-4 text-xl font-semibold" {...props} />
  ),
  p: (props: ComponentProps<"p">) => <p className="mb-4 leading-7" {...props} />,
  ul: (props: ComponentProps<"ul">) => <ul className="mb-4 ml-6 list-disc space-y-2" {...props} />,
  ol: (props: ComponentProps<"ol">) => (
    <ol className="mb-4 ml-6 list-decimal space-y-2" {...props} />
  ),
  li: (props: ComponentProps<"li">) => <li className="leading-7" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-blue-600 hover:underline dark:text-blue-400"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  code: (props: ComponentProps<"code">) => {
    if (!props.className) {
      return <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm" {...props} />;
    }

    return <code {...props} />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-slate-200 dark:bg-gray-950"
      {...props}
    />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="text-muted-foreground mb-4 border-l-4 border-blue-500 pl-4 italic"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse" {...props} />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="border-border bg-muted border px-4 py-2 text-left font-semibold" {...props} />
  ),
  td: (props: ComponentProps<"td">) => <td className="border-border border px-4 py-2" {...props} />,
  hr: () => <hr className="border-border my-8" />,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
