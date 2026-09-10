import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
  children: ReactNode;
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

/**
 * The opening of every homepage band: the heading is the value, the one line
 * under it is the proof. There is no paragraph after that line. A visitor who
 * reads only headings and summary lines gets the whole argument, which is the
 * reader these bands are written for: scrolling fast, not yet decided to read.
 */
export function BandIntro({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  /** The summary line, at most one sentence or two, never a paragraph. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2
        id={id}
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.1] tracking-[-0.02em]"
      >
        {title}
      </h2>
      <p className="text-ink-secondary mt-3 max-w-[52ch] text-pretty text-[17px] leading-[1.5]">
        {children}
      </p>
    </div>
  );
}

/** The two-column figure grid every band uses: side by side at 1040, stacked on a phone. */
export function BandGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid items-start gap-x-10 gap-y-9 [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A figure's title: display face, one size under the band heading. */
export function FigureTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "font-display text-ink text-[17px] font-semibold tracking-[-0.01em]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The mono line under a figure: what it is, in the figure's own terms. */
export function MonoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-ink-muted font-mono text-[11.5px] leading-[1.6]", className)}>
      {children}
    </p>
  );
}

const LINK =
  "focus-visible:ring-ring focus-visible:ring-offset-background inline-block rounded-sm text-[14.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const LINK_TONE = {
  primary:
    "text-primary hover:text-go-fg border-b border-[oklch(var(--primary)/0.35)] hover:border-[oklch(var(--go-text))]",
  muted: "text-ink-muted hover:text-ink border-border-strong hover:border-ink-muted border-b",
} as const;

/**
 * A band's way out to the page that explains it. Underlined by a border rather
 * than a text decoration so the line sits under the descenders, as the rest of
 * the site's prose links do. One primary per band, a muted second at most.
 */
export function BandLink({
  to,
  tone = "primary",
  children,
  className,
}: {
  to: string;
  tone?: keyof typeof LINK_TONE;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cn(LINK, LINK_TONE[tone], className)}>
      {children}
    </Link>
  );
}

/** The row of a band's links, wrapping on a phone. */
export function BandLinks({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-6 gap-y-2", className)}>{children}</div>
  );
}
