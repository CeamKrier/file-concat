import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";

import { MarketingSection } from "./section";

/** The local pipeline, shown as a readout: read → extract → filter → combine.
 * The proof is the work happening in the tab, not a network claim. */
const STEPS = [
  "142 files read in this tab",
  "text pulled from 9 PDFs and 3 Word docs",
  "node_modules and build output left out",
];

/** Section C: privacy shown by behavior — the processing runs in the browser,
 * rendered as a mock of the tool's own local readout. */
export function PrivacySection() {
  return (
    <MarketingSection
      labelledBy="private-by-design"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="private-by-design"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          We don't upload your files.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          Drag a folder in and it's read, filtered, and combined right here in your browser.
          There's no upload step to combine them, and no account to create.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <ShieldCheck className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Read and combined in your browser, no upload step
        </p>
        <div>
          <Link
            to="/privacy"
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background mt-4 inline-flex items-center gap-1 rounded-sm text-[13px] underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            What we collect, and what we don't
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      <div className="min-w-0">
        <div className="border-border bg-surface-inset rounded-card overflow-hidden border">
          <div className="border-hairline flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-ink-muted font-mono text-[11.5px] uppercase tracking-[0.14em]">
              Processing
            </span>
            <span className="text-ink-faint font-mono text-[11px]">in your browser</span>
          </div>

          <ul className="divide-hairline divide-y font-mono text-[12px]">
            {STEPS.map((step) => (
              <li key={step} className="flex items-center gap-3 px-4 py-2.5">
                <Check className="text-primary h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                <span className="text-ink-secondary min-w-0 flex-1">{step}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-3">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1">combined into 1 file</span>
              <span className="text-go-fg shrink-0">48k tokens</span>
            </li>
          </ul>
        </div>
      </div>
    </MarketingSection>
  );
}
