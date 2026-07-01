import { cn } from "~/lib/utils";

type Tone = "base" | "alt" | "cli";

const TONE_BG: Record<Tone, string> = {
  base: "",
  alt: "bg-surface-alt",
  cli: "bg-[#100d09]",
};

/**
 * A marketing band: full-width with a top hairline, a tinted background per
 * tone, and a centered 1040px inner column. Vertical rhythm is shared so the
 * stack reads as one page, not a pile of disconnected sections.
 */
export function MarketingSection({
  tone = "base",
  id,
  labelledBy,
  children,
  className,
}: {
  tone?: Tone;
  id?: string;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("border-hairline border-t", TONE_BG[tone])}
    >
      <div
        className={cn("mx-auto w-full max-w-[1040px] px-4 py-16 sm:px-6 md:py-[70px]", className)}
      >
        {children}
      </div>
    </section>
  );
}
