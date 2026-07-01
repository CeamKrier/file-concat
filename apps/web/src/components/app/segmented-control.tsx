import { cn } from "~/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

/**
 * Small inline segmented control. Used for the output format switch and the
 * import source tabs. Active segment gets the warm fill (#221d16) + ink text;
 * the rest stays muted. Keyboard- and screen-reader-addressable via radiogroup.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "border-border bg-surface-inset rounded-input inline-flex items-center gap-0.5 border p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-visible:ring-ring focus-visible:ring-offset-surface-inset rounded-[7px] font-mono font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active
                ? "bg-accent text-ink shadow-[inset_0_0_0_1px_oklch(var(--border-strong))]"
                : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
