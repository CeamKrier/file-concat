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
  body: "Repomix, gitingest, code2prompt and FileConcat, measured over 60 repositories",
  to: "/blog/repomix-vs-gitingest-vs-code2prompt",
} satisfies { label: string; body: string; to: string } | null;

export function HeroAnnouncement() {
  if (!ANNOUNCEMENT) return null;

  return (
    <Link
      to={ANNOUNCEMENT.to}
      className="text-ink-secondary hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background group inline-flex max-w-full items-center gap-2.5 rounded-sm text-left text-[13.5px] leading-[1.35] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <span className="text-primary shrink-0 rounded-[6px] border border-[oklch(var(--primary)/0.4)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.08em]">
        {ANNOUNCEMENT.label}
      </span>
      <span className="min-w-0">{ANNOUNCEMENT.body}</span>
      <ChevronRight
        className="text-ink-muted group-hover:text-ink h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
        strokeWidth={2.5}
      />
    </Link>
  );
}
