import { MDXProvider } from "@mdx-js/react";
import type { ComponentProps, ReactNode } from "react";

const components = {
  h1: (props: ComponentProps<"h1">) => (
    <h1
      className="mb-6 mt-2 font-display text-[clamp(2rem,3.5vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.035em] text-foreground"
      style={{ textWrap: "balance" }}
      {...props}
    />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2
      className="mb-4 mt-14 font-display text-[clamp(1.375rem,2.25vw,1.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground"
      style={{ textWrap: "balance" }}
      {...props}
    />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3
      className="mb-3 mt-9 font-display text-[18px] font-semibold leading-[1.3] tracking-[-0.02em] text-foreground"
      {...props}
    />
  ),
  p: (props: ComponentProps<"p">) => (
    <p
      className="mb-5 max-w-[68ch] text-[15.5px] leading-[1.7] text-muted-foreground"
      style={{ textWrap: "pretty" }}
      {...props}
    />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul className="mb-6 ml-5 list-disc space-y-2 marker:text-muted-foreground/50" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      className="mb-6 ml-5 list-decimal space-y-2 marker:font-mono marker:text-[12px] marker:text-muted-foreground"
      {...props}
    />
  ),
  li: (props: ComponentProps<"li">) => (
    <li className="text-[15.5px] leading-[1.65] text-muted-foreground" {...props} />
  ),
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-foreground underline decoration-primary/50 decoration-1 underline-offset-[5px] transition-colors duration-150 hover:decoration-primary"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  strong: (props: ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  code: (props: ComponentProps<"code">) => {
    // Inline code (no language class). Block code keeps the prism theme.
    if (!props.className) {
      return (
        <code
          className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
          {...props}
        />
      );
    }
    return <code {...props} />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="mb-7 overflow-x-auto rounded-xl border border-border bg-[oklch(0.13_0.003_150)] p-5 font-mono text-[13px] leading-[1.7] text-foreground/90"
      {...props}
    />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-6 max-w-[60ch] rounded-md bg-secondary/60 px-5 py-4 text-[15px] leading-[1.6] text-foreground/90"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="mb-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[14px]" {...props} />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th
      className="border-b border-border bg-secondary/40 px-4 py-2.5 text-left font-display text-[12.5px] font-semibold uppercase tracking-[0.05em] text-foreground"
      {...props}
    />
  ),
  td: (props: ComponentProps<"td">) => (
    <td
      className="border-b border-border/60 px-4 py-2.5 text-muted-foreground last:border-b-0"
      {...props}
    />
  ),
  hr: () => <hr className="my-12 border-border/60" />,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
