import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

/**
 * The hero's announcement slot: one line for whatever shipped most recently,
 * and nothing at all when nothing has.
 *
 * The whole announcement is this one object. Changing it is editing three
 * strings, and taking it down is setting it to `null` — an announcement that
 * needs a component rewritten to retire is one that sits there for a year
 * calling itself new.
 *
 * It sits above the trust pill rather than beside it, and it is the only link
 * in the hero above the drop zone: news is worth one line, never a second row
 * of decoration competing with the heading.
 */
const ANNOUNCEMENT = {
  label: "New",
  body: "Clip any web page into your bundle",
  to: "/clipper",
} as const satisfies { label: string; body: string; to: string } | null;

export function HeroAnnouncement() {
  if (!ANNOUNCEMENT) return null;

  return (
    <Link
      to={ANNOUNCEMENT.to}
      className="border-hairline bg-surface-alt text-ink-secondary hover:border-border hover:text-ink rounded-pill focus-visible:ring-ring focus-visible:ring-offset-background group inline-flex items-center gap-2 whitespace-nowrap border py-1 pl-1.5 pr-3 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <span className="bg-primary text-primary-foreground rounded-pill px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
        {ANNOUNCEMENT.label}
      </span>
      {ANNOUNCEMENT.body}
      <ChevronRight
        className="text-ink-muted group-hover:text-ink h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
        strokeWidth={2.5}
      />
    </Link>
  );
}
