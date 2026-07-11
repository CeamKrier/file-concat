import { Children, isValidElement, type ReactNode } from "react";

/**
 * `<Steps>` wraps `<Step title="...">` children into a numbered vertical flow.
 * Use only where order carries information (a real sequence), never as generic
 * scaffolding. The green numbered discs and hairline connector reuse the
 * numbered-flow language already established on the persona pages.
 */
export function Steps({ children }: { children?: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement);
  const total = steps.length;

  return (
    <ol className="my-8 list-none pl-0">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-4 pb-7 last:pb-0">
          {i < total - 1 && (
            <span
              aria-hidden="true"
              className="bg-hairline absolute bottom-0 left-[13.5px] top-[30px] w-px"
            />
          )}
          <span className="bg-primary text-primary-foreground font-display relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">{step}</div>
        </li>
      ))}
    </ol>
  );
}

/** One step. `title` is the heading; children are the explanatory prose. */
export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h3 className="font-display text-ink text-[16px] font-semibold leading-snug tracking-[-0.01em]">
        {title}
      </h3>
      <div className="text-ink-secondary mt-1 [&_a]:text-[14.5px] [&_p]:my-0 [&_p]:text-[14.5px] [&_p]:leading-[1.6] [&_p:not(:last-child)]:mb-2">
        {children}
      </div>
    </>
  );
}
