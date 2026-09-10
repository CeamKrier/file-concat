import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";

import { MarketingSection } from "./section";

const DESTINATIONS = [
  { label: "ChatGPT Projects", to: "/for/chatgpt-projects" },
  { label: "Claude Projects", to: "/for/claude-projects" },
  { label: "Gemini Gems", to: "/for/gemini-gems" },
  { label: "NotebookLM", to: "/for/notebooklm" },
] as const;

const PROSE_LINK =
  "text-ink-secondary hover:text-ink border-border-strong hover:border-ink-muted border-b transition-colors duration-150";

/** Band 8: the closing nudge back to the tool, and where the file is going. */
export function CtaSection() {
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="final-cta" className="text-center md:py-[88px]">
      <h2
        id="final-cta"
        className="font-display text-ink mx-auto text-balance text-[clamp(1.9rem,4.5vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.025em]"
      >
        Drop a folder. Get one file.
      </h2>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-chip focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3.5 text-[15px] font-bold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Open the tool
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <Link
          to="/docs"
          className="border-border-strong text-ink bg-secondary rounded-chip focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex items-center justify-center border px-6 py-3.5 text-[15px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Read the docs
        </Link>
      </div>

      {/* Each destination has a page with its own limit and the month it was
          checked. The caps live there, never here, because they change. */}
      <p className="text-ink-muted mx-auto mt-[26px] max-w-[60ch] text-pretty text-[14.5px] leading-[1.6]">
        Built for a destination with a limit:{" "}
        {DESTINATIONS.map((d) => (
          <span key={d.to}>
            <Link to={d.to} className={PROSE_LINK}>
              {d.label}
            </Link>
            ,{" "}
          </span>
        ))}
        or{" "}
        <Link to="/how-to/share-all-files-with-ai" className={PROSE_LINK}>
          any model at once
        </Link>
        .
      </p>
    </MarketingSection>
  );
}
