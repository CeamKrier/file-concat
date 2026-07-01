import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";

import { MarketingSection } from "./section";

/** Section E: the closing nudge back to the tool. */
export function CtaSection() {
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="final-cta" className="text-center">
      <h2
        id="final-cta"
        className="font-display text-ink mx-auto max-w-[16ch] text-balance text-[clamp(1.9rem,4.5vw,2.375rem)] font-bold leading-[1.06] tracking-[-0.025em]"
      >
        Drop a folder. Get one file.
      </h2>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Open the tool
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <Link
          to="/docs"
          className="border-border-strong text-ink bg-surface rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex items-center justify-center border px-6 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Read the docs
        </Link>
      </div>
    </MarketingSection>
  );
}
