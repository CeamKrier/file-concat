import { Check } from "lucide-react";

import { cn } from "~/lib/utils";

type ProcessingViewProps = {
  percent: number;
  sourceLabel: string;
  steps: string[];
  stepIndex: number;
};

/**
 * The "explain what's happening" moment. A determinate spinner with the live
 * percent at its center, then a plain-language checklist whose dots fill green
 * as each step completes. Narration is the point — never a bare spinner.
 */
export function ProcessingView({ percent, sourceLabel, steps, stepIndex }: ProcessingViewProps) {
  const current = steps[Math.min(stepIndex, steps.length - 1)] ?? "Working…";

  return (
    <section className="animate-fade-up mx-auto flex w-full max-w-[560px] flex-col items-center px-4 pt-16 text-center motion-reduce:animate-none">
      <div className="relative h-[72px] w-[72px]">
        <div className="border-border absolute inset-0 rounded-full border-[3px]" />
        <div className="border-primary absolute inset-0 animate-spin rounded-full border-[3px] border-b-transparent border-l-transparent border-r-transparent" />
        <div className="text-ink absolute inset-0 flex items-center justify-center font-mono text-sm font-medium tabular-nums">
          {Math.round(percent)}%
        </div>
      </div>

      <h2 className="font-display text-ink mt-6 text-[22px] font-bold tracking-[-0.02em]">
        {current}
      </h2>
      <p className="text-ink-muted mt-1 font-mono text-[13px]">{sourceLabel}</p>

      <ul className="mt-8 flex w-full max-w-[340px] flex-col gap-2.5 text-left">
        {steps.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                  done && "border-primary bg-[oklch(var(--primary)/0.18)]",
                  active && "border-primary",
                  !done && !active && "border-border",
                )}
              >
                {done ? (
                  <Check className="text-primary h-3 w-3" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      active ? "bg-primary" : "bg-ink-faint",
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors duration-200",
                  done && "text-ink-secondary",
                  active && "text-ink font-medium",
                  !done && !active && "text-ink-faint",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
