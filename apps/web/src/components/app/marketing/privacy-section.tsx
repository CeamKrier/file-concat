import { cn } from "~/lib/utils";
import { BandIntro, BandLink, BandLinks, FigureTitle, MarketingSection } from "./section";

/**
 * The run's stage rail as the processing view draws it, stopped mid-run. The
 * counts are a shape example. The proof is the work happening in the tab, not
 * a network claim: the durable statement is that the document bytes are never
 * uploaded, and the privacy page says what the analytics do see.
 */
const STAGES = [
  { label: "finding files", detail: "142 found", state: "done" },
  { label: "reading", detail: "37 read", state: "done" },
  { label: "extracting documents", detail: "9 pdf, 3 docx", state: "active" },
  { label: "filtering", detail: "defaults", state: "pending" },
  { label: "combining", detail: "one file", state: "pending" },
] as const;

/** Band 6: privacy shown by behaviour. */
export function PrivacySection() {
  return (
    <MarketingSection
      labelledBy="private-by-design"
      className="grid items-center gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))]"
    >
      <StageRail />
      <div className="min-w-0">
        <BandIntro id="private-by-design" title="We don't upload your files.">
          Read, filtered and combined in the tab. No upload, no account. Anonymous usage
          analytics run; the privacy page says what they see.
        </BandIntro>
        <BandLinks className="mt-6">
          <BandLink to="/privacy">What we collect, and what we don&apos;t</BandLink>
        </BandLinks>
      </div>
    </MarketingSection>
  );
}

function StageRail() {
  return (
    <div className="border-border bg-surface rounded-chip min-w-0 border p-5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-3">
        <FigureTitle className="text-[19px]">Reading your files</FigureTitle>
        <span className="text-ink-faint font-mono text-[11px]">in this tab</span>
      </div>
      <div className="text-ink-secondary mb-[18px] font-mono text-[13px] tabular-nums">
        <span className="text-ink">37</span> / 142 files
      </div>
      <ol aria-label="Stages" className="grid">
        {STAGES.map((s) => (
          <li
            key={s.label}
            aria-current={s.state === "active" ? "step" : undefined}
            className="border-border grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2.5"
          >
            <span
              className={cn(
                "h-3.5 w-3.5 justify-self-center rounded-full border-2",
                s.state === "pending" ? "border-border-strong" : "border-primary",
                s.state === "done" ? "bg-primary" : "bg-transparent",
              )}
            />
            <span className={cn("text-[14.5px]", s.state === "pending" ? "text-ink-muted" : "text-ink")}>
              {s.label}
            </span>
            <span className="text-ink-muted font-mono text-[11.5px]">{s.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
