import { Check, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { BandGrid, BandIntro, BandLink, BandLinks, FigureTitle, MarketingSection } from "./section";

/** Band 4: the defaults, and the measurement that set them. */
export function FilteringSection() {
  return (
    <MarketingSection labelledBy="what-gets-through">
      <BandIntro
        id="what-gets-through"
        title="Drop the whole thing. The defaults are measured."
        className="[&>h2]:max-w-[22ch]"
      >
        The list of what gets left out was run over 60 public repositories and changed twice because
        of what it found.
      </BandIntro>

      <BandGrid className="mt-10">
        <CompositionBar />
        <div className="min-w-0">
          <p className="text-ink-secondary mb-3 text-[15px]">
            Every default can be overridden, with presets.
          </p>
          <TreeRows />
          <BandLinks className="mt-[22px] flex-col items-start gap-y-2.5">
            <BandLink to="/blog/how-many-tokens-is-a-codebase">
              How many tokens is a codebase
            </BandLink>
            <BandLink to="/docs/file-filtering" tone="muted">
              The full default list and how to override it
            </BandLink>
          </BandLinks>
        </div>
      </BandGrid>
    </MarketingSection>
  );
}

/**
 * Kept tokens by category, pooled over the sample, from the codebase study
 * (`/blog/how-many-tokens-is-a-codebase`, measured 2026-09-07). Tests are
 * hatched rather than tinted: since 2026-09-09 the defaults leave them out by
 * name, so the segment shows what the bar used to carry and no longer does.
 */
const HATCH =
  "repeating-linear-gradient(135deg,oklch(var(--neutral-info)/0.55) 0 4px,#241f18 4px 8px)";
const HATCH_SWATCH =
  "repeating-linear-gradient(135deg,oklch(var(--neutral-info)/0.55) 0 3px,#241f18 3px 6px)";

const SEGMENTS = [
  { label: "source code", share: 70.6, fill: "oklch(var(--chart-1))" },
  { label: "tests", share: 17.5, fill: HATCH, swatch: HATCH_SWATCH },
  { label: "documentation", share: 6.6, fill: "oklch(var(--chart-3))" },
  { label: "configuration", share: 5.0, fill: "oklch(var(--chart-5))" },
];

function CompositionBar() {
  const rest = 100 - SEGMENTS.reduce((sum, s) => sum + s.share, 0);
  return (
    <figure className="border-border-strong bg-surface rounded-chip min-w-0 border p-5">
      <FigureTitle className="mb-[18px]">What the kept tokens are made of</FigureTitle>
      <div className="flex h-[34px] gap-px overflow-hidden rounded-[4px]" aria-hidden="true">
        {SEGMENTS.map((s) => (
          <span key={s.label} style={{ width: `${s.share}%`, background: s.fill }} />
        ))}
        {rest > 0 ? <span className="bg-[#3a3329]" style={{ width: `${rest}%` }} /> : null}
      </div>
      <div className="mt-[18px] grid gap-2.5">
        {SEGMENTS.map((s) => (
          <div key={s.label} className="grid grid-cols-[12px_1fr_auto] items-center gap-3">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: s.swatch ?? s.fill }} />
            <span className="text-ink text-[13.5px]">{s.label}</span>
            <span className="text-ink font-mono text-[12.5px] tabular-nums">
              {s.share.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <figcaption className="text-ink-muted border-border mt-[18px] border-t pt-3.5 font-mono text-[11.5px] leading-[1.6]">
        kept tokens pooled over 60 repositories, 39,107 files
      </figcaption>
    </figure>
  );
}

/** Three rows of the settings drawer's file tree: one in, two out, with why. */
const ROWS = [
  { name: "src/", note: "312 files", kept: true },
  { name: ".github/workflows/", note: "hidden", kept: false },
  { name: "go.sum", note: "lockfile", kept: false },
];

function TreeRows() {
  return (
    <div className="border-border bg-surface rounded-chip border px-2 py-1.5 font-mono text-[13px]">
      {ROWS.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5 px-2 py-[9px]">
          {r.kept ? (
            <Check className="text-primary h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
          ) : (
            <X className="text-ink-faint h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
          )}
          <span className={cn(r.kept ? "text-ink" : "text-ink-muted")}>{r.name}</span>
          <span className="text-ink-faint ml-auto text-[11px]">{r.note}</span>
        </div>
      ))}
    </div>
  );
}
