import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export type InfoTone = "info" | "neutral" | "go";

const TONE: Record<InfoTone, { wrap: string; icon: string }> = {
  // amber — informational heads-up, never an alarm
  info: {
    wrap: "border-[oklch(var(--info)/0.3)] bg-[oklch(var(--info)/0.07)]",
    icon: "text-info",
  },
  // blue — neutral / optional context
  neutral: {
    wrap: "border-[oklch(var(--neutral-info)/0.3)] bg-[oklch(var(--neutral-info)/0.07)]",
    icon: "text-neutral-info",
  },
  // green — go / success
  go: {
    wrap: "border-[oklch(var(--primary)/0.3)] bg-[oklch(var(--primary)/0.08)]",
    icon: "text-primary",
  },
};

/**
 * One card, three tones — full borders + a tint wash, never a side-stripe.
 * Carries the amber "left out" heads-up, the blue big-bundle note, and green
 * source notes. Title + icon always present so status never relies on color.
 */
export function InfoCard({
  tone,
  icon: Icon,
  title,
  children,
  className,
}: {
  tone: InfoTone;
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("rounded-card border p-4", t.wrap, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", t.icon)} strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-semibold">{title}</p>
          {children && <div className="text-ink-secondary mt-1.5 text-[13px]">{children}</div>}
        </div>
      </div>
    </div>
  );
}
