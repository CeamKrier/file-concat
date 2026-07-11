import { Children, isValidElement, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { MockWindow } from "~/components/app/marketing";

/**
 * `<BeforeAfter>` places a `<Before>` and an `<After>` frame side by side with a
 * connector, stacking on narrow viewports. Serves the "precision" brand value:
 * raw `cat` output vs FileConcat's labeled bundle, or a token count before and
 * after filtering. Reuses the MockWindow chrome from the marketing mocks.
 */
export function BeforeAfter({ children }: { children?: ReactNode }) {
  const [before, after] = Children.toArray(children).filter(isValidElement);

  return (
    <div className="my-8 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-4">
      {before}
      <div className="text-ink-faint flex items-center justify-center" aria-hidden="true">
        <ArrowRight className="hidden h-5 w-5 md:block" strokeWidth={2} />
        <span className="font-mono text-[11px] md:hidden">becomes</span>
      </div>
      {after}
    </div>
  );
}

function Frame({
  label,
  tokens,
  children,
}: {
  label: string;
  tokens?: string;
  children?: ReactNode;
}) {
  return (
    <MockWindow label={label} trailing={tokens ? <TokenChip value={tokens} /> : undefined}>
      <pre className="text-code overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7]">
        <code>{children}</code>
      </pre>
    </MockWindow>
  );
}

/** The "before" frame. `label` is the title-bar name; children are the body. */
export function Before(props: { label: string; tokens?: string; children?: ReactNode }) {
  return <Frame {...props} />;
}

/** The "after" frame. Same shape as Before; separated for readable MDX. */
export function After(props: { label: string; tokens?: string; children?: ReactNode }) {
  return <Frame {...props} />;
}

function TokenChip({ value }: { value: string }) {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">≈ {value}</span>
      <span className="text-ink-faint"> tokens</span>
    </span>
  );
}
