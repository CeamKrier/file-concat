import { MDXProvider } from "@mdx-js/react";
import type { ComponentProps, ReactNode } from "react";

const components = {
  h1: (props: ComponentProps<"h1">) => (
    <h1
      className="text-ink font-display mb-6 mt-2 scroll-mt-[80px] text-[clamp(2rem,3.5vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.035em]"
      style={{ textWrap: "balance" }}
      {...props}
    />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2
      className="text-ink font-display mb-4 mt-14 scroll-mt-[80px] text-[clamp(1.375rem,2.25vw,1.75rem)] font-semibold leading-[1.15] tracking-[-0.03em]"
      style={{ textWrap: "balance" }}
      {...props}
    />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3
      className="text-ink font-display mb-3 mt-9 scroll-mt-[80px] text-[18px] font-semibold leading-[1.3] tracking-[-0.02em]"
      {...props}
    />
  ),
  p: (props: ComponentProps<"p">) => (
    <p
      className="text-ink-secondary mb-5 max-w-[68ch] text-[15.5px] leading-[1.7]"
      style={{ textWrap: "pretty" }}
      {...props}
    />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul className="marker:text-ink-faint mb-6 ml-5 list-disc space-y-2" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      className="marker:text-ink-muted mb-6 ml-5 list-decimal space-y-2 marker:font-mono marker:text-[12px]"
      {...props}
    />
  ),
  li: (props: ComponentProps<"li">) => (
    <li className="text-ink-secondary text-[15.5px] leading-[1.65]" {...props} />
  ),
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-ink decoration-primary/50 hover:decoration-primary underline decoration-1 underline-offset-[5px] transition-colors duration-150"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  strong: (props: ComponentProps<"strong">) => (
    <strong className="text-ink font-semibold" {...props} />
  ),
  code: (props: ComponentProps<"code">) => {
    // Inline code (no language class). Block code keeps the prism theme.
    if (!props.className) {
      return (
        <code
          className="border-border/60 bg-surface-inset text-ink rounded-[5px] border px-1.5 py-0.5 font-mono text-[0.85em]"
          {...props}
        />
      );
    }
    return <code {...props} />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="border-border bg-surface-inset text-code rounded-card mb-7 overflow-x-auto border p-5 font-mono text-[13px] leading-[1.7]"
      {...props}
    />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="border-border bg-surface-alt text-ink-secondary rounded-card mb-6 max-w-[64ch] border px-5 py-4 text-[15px] leading-[1.6]"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="border-border rounded-card mb-6 overflow-x-auto border">
      <table className="w-full border-collapse text-[14px]" {...props} />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th
      className="border-hairline bg-surface-alt text-ink font-display border-b px-4 py-2.5 text-left text-[12.5px] font-semibold uppercase tracking-[0.05em]"
      {...props}
    />
  ),
  td: (props: ComponentProps<"td">) => (
    <td
      className="border-hairline text-ink-secondary border-b px-4 py-2.5 last:border-b-0"
      {...props}
    />
  ),
  hr: () => <hr className="border-hairline my-12" />,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
