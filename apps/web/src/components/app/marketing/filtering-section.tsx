import { Archive, Check, Globe, ImageOff, Link2, Minus } from "lucide-react";

import { cn } from "~/lib/utils";
import { InfoCard } from "../info-card";
import { MarketingSection } from "./section";

const COMBINED = ["Code", "Docs", "Configs", "Data"];
const SKIPPED = ["Images", "node_modules", "*.lock", "Build output"];

const EXTRAS = [
  { icon: Archive, text: "Archives unpack themselves" },
  { icon: Link2, text: "Repos & Gists import by URL" },
  { icon: Globe, text: "Single web pages too" },
];

/** Section B: reassurance that dropping the whole thing is safe. */
export function FilteringSection() {
  return (
    <MarketingSection tone="alt" labelledBy="what-gets-through">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="what-gets-through"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Drop the whole thing. The right files get through.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          No need to hand-pick. The text gets combined and the noise gets left behind,
          automatically.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-[760px] gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-[oklch(var(--primary)/0.3)] bg-[oklch(var(--primary)/0.06)] p-5">
          <div className="flex items-center gap-2">
            <Check className="text-primary h-[18px] w-[18px]" strokeWidth={2.5} />
            <h3 className="text-ink text-sm font-semibold">Combined</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {COMBINED.map((c) => (
              <Chip key={c} tone="go">
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div className="border-border bg-surface rounded-card border p-5">
          <div className="flex items-center gap-2">
            <Minus className="text-ink-faint h-[18px] w-[18px]" strokeWidth={2.5} />
            <h3 className="text-ink-secondary text-sm font-semibold">Skipped for you</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SKIPPED.map((c) => (
              <Chip key={c} tone="muted">
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-[760px] flex-wrap justify-center gap-2">
        {EXTRAS.map(({ icon: Icon, text }) => (
          <span
            key={text}
            className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1.5 text-[12.5px] font-medium"
          >
            <Icon className="text-primary h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {text}
          </span>
        ))}
      </div>

      <div className="mx-auto mt-5 max-w-[760px]">
        <InfoCard tone="info" icon={ImageOff} title="Images need a different tool">
          <p>
            Images aren&apos;t text, so they can&apos;t be combined into the document. Reading them
            takes a vision model, which is a separate job from bundling files.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function Chip({ tone, children }: { tone: "go" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-chip px-2 py-1 font-mono text-[11.5px]",
        tone === "go"
          ? "text-go-fg bg-[oklch(var(--primary)/0.1)]"
          : "text-ink-muted bg-surface-inset",
      )}
    >
      {children}
    </span>
  );
}
