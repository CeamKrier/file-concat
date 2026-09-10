import { Check, X } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  BandGrid,
  BandIntro,
  BandLink,
  BandLinks,
  FigureTitle,
  MarketingSection,
  MonoNote,
} from "./section";

const STUDY = "/blog/repomix-vs-gitingest-vs-code2prompt";

/**
 * Band 5: the tool comparison, cost and content together. It leads with the
 * one effectiveness fact the study measured (only this tool reads the
 * documents) and shows cost as bars with the study's own caveat under them,
 * because a size ranking where we are second of four is not a verdict and the
 * study says so. Usefulness is not measured yet; nothing here implies it.
 */
export function ComparisonSection() {
  return (
    <MarketingSection tone="alt" id="comparison" labelledBy="measured-against">
      <BandIntro id="measured-against" title="Measured against the tools you would compare it with.">
        Four tools over the same 60 repositories, each at its own defaults, one tokenizer.
      </BandIntro>

      <BandGrid className="mt-10">
        <ReaderStrip />
        <CostBars />
      </BandGrid>

      {/* The usefulness figure lands under the grid when it ships. */}
      <MonoNote className="border-border-strong mt-14 border-t pt-4">
        The most aggressive filter of the four. Asking about your CI? Turn hidden files back on.
      </MonoNote>
      <BandLinks className="mt-5">
        <BandLink to={STUDY}>Repomix vs gitingest vs code2prompt, 60 repositories measured</BandLink>
      </BandLinks>
    </MarketingSection>
  );
}

const OTHERS = ["Repomix", "gitingest", "code2prompt"];

/** One directory holding a source file and a one-page PDF, through four tools. */
function ReaderStrip() {
  return (
    <div className="min-w-0">
      <FigureTitle className="mb-2.5">One directory, one source file, one PDF</FigureTitle>
      <div className="border-border-strong grid border-t">
        <div className="border-border-strong grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 border-b px-1 py-[18px]">
          <Check className="text-primary h-5 w-5" strokeWidth={2.6} />
          <span className="text-ink font-mono text-[16px]">FileConcat</span>
          <span className="text-primary text-right text-[14.5px]">the PDF&apos;s text is in the bundle</span>
        </div>
        {OTHERS.map((tool, i) => (
          <div
            key={tool}
            className={cn(
              "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 border-b px-1 py-3",
              i === OTHERS.length - 1 ? "border-border-strong" : "border-border",
            )}
          >
            <X className="text-ink-faint h-5 w-5" strokeWidth={2.2} />
            <span className="text-ink-secondary font-mono text-[14px]">{tool}</span>
            <span className="text-ink-faint text-right text-[13.5px]">code only, the PDF is skipped</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Median bundle over the 60 repositories, each tool at its own defaults, 2026-09-08. */
const COST = [
  { tool: "Repomix", tokens: 239_861 },
  { tool: "FileConcat", tokens: 246_498 },
  { tool: "gitingest", tokens: 258_790 },
  { tool: "code2prompt", tokens: 432_539 },
];

function CostBars() {
  const max = Math.max(...COST.map((c) => c.tokens));
  const cheapest = Math.min(...COST.map((c) => c.tokens));
  const pct = (v: number) => `${((v / max) * 100).toFixed(2)}%`;

  return (
    <figure className="min-w-0">
      <FigureTitle className="mb-4">Median bundle, tokens</FigureTitle>
      <div className="grid gap-2.5">
        {COST.map((c) => {
          const ours = c.tool === "FileConcat";
          return (
            <div
              key={c.tool}
              className="grid grid-cols-[minmax(72px,112px)_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className={cn("font-mono text-[13px]", ours ? "text-primary" : "text-ink-secondary")}>
                {c.tool}
              </span>
              <span className="relative block h-[22px]" aria-hidden="true">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-[3px]",
                    ours ? "bg-primary" : "bg-[#3a3329]",
                  )}
                  style={{ width: pct(c.tokens) }}
                />
                <span
                  className="absolute -bottom-[5px] -top-[5px] w-px [background:repeating-linear-gradient(to_bottom,oklch(var(--text-muted))_0_4px,transparent_4px_8px)]"
                  style={{ left: pct(cheapest) }}
                />
              </span>
              <span className="text-ink text-right font-mono text-[13px] tabular-nums">
                {c.tokens.toLocaleString("en-US")}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="text-ink-secondary mt-4 max-w-[52ch] text-pretty text-[14px] leading-[1.55]">
        within 3% of the cheapest at the median; gitingest cheapest most often, 27 of 60
      </figcaption>
      <MonoNote className="mt-2">fewer tokens only helps if the dropped file did not matter</MonoNote>
    </figure>
  );
}
