import { ArrowRight, ArrowUp, Check, Hash, ScanLine } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

/**
 * /for/researchers — the Researcher persona page (ADR-0006). Hosts the real app
 * flow: the hero embeds a working DropZone (via AppFlow's renderLanding slot), so
 * a drop starts bundling in place instead of bouncing to the home route. Leads
 * with the context-window / token budget, this persona's real constraint, so it
 * reads distinctly from /for/legal (which leads with confidentiality). Still
 * covers the four-part contract: workflow, file types, worked example, hook.
 */
export function ResearchersPage() {
  return <AppFlow renderLanding={(dropProps) => <ResearchersLanding {...dropProps} />} />;
}

function ResearchersLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <ContextWindow />
      <Workflow />
      <Inputs />
      <WorkedExample />
      <ClosingCta />
    </>
  );
}

const TRUST = ["Nothing is uploaded", "Token count shown before you paste", "PDFs, notes, and data"];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Hash className="text-primary h-3 w-3" strokeWidth={2.5} />
            See the token count before you paste
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Turn a folder of papers into one context window.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop the PDFs, your notes, and the data. FileConcat pulls the text out of every paper
            right in your browser, packs it into one document, and shows you the token count so you
            know it fits ChatGPT, Claude, or Gemini before you paste.
          </p>

          <ul className="mt-6 space-y-2">
            {TRUST.map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2 text-[14px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>

          <a
            href="#example"
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background mt-6 inline-flex rounded-sm text-[13px] underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            See a worked example
          </a>
        </div>

        <div className="min-w-0">
          <DropZone
            {...dropProps}
            title="Drag your reading folder here"
            hint="Papers, notes, and data. Read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function ContextWindow() {
  return (
    <MarketingSection
      labelledBy="research-context"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="research-context"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Know it fits before you paste.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          The hard part of reading with a model is not the reading, it is the budget. FileConcat
          counts the tokens as it bundles, so you see whether the whole pile lands in one window
          before you ever paste it.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Hash className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Counted locally, with the same tokenizer the models use
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="attention-survey, token budget">
          <div className="px-4 py-4 font-mono text-[12.5px]">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-secondary">6 papers, notes, data</span>
              <span className="text-primary">~128,000 tokens</span>
            </div>
            <div className="bg-surface-alt mt-3 h-2.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: "64%" }} />
            </div>
            <div className="text-ink-faint mt-2 flex items-baseline justify-between text-[11px]">
              <span>64% of a 200k window</span>
              <span className="text-go-fg">fits in one paste</span>
            </div>
          </div>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the reading folder",
    body: "Papers, notes, and datasets together. Nested folders are fine.",
  },
  {
    title: "Every file becomes text",
    body: "PDFs are extracted, notes and data pass straight through, boilerplate is dropped.",
  },
  {
    title: "One document, counted up front",
    body: "You get a single file, with the token count up front so you know whether it lands in one window.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="research-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="research-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a reading pile to a prompt.
        </h2>

        <ol className="space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="text-primary-foreground bg-primary font-display mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-ink text-[15px] font-semibold">{step.title}</h3>
                <p className="text-ink-secondary mt-1 text-[14px] leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MarketingSection>
  );
}

const KINDS = [
  { label: "Papers", exts: "PDF", note: "born-digital preprints and journal PDFs" },
  { label: "Notes", exts: "MD, TXT", note: "your reading notes and outlines" },
  { label: "Data", exts: "CSV, JSON, XLSX", note: "results tables and small datasets" },
];

function Inputs() {
  return (
    <MarketingSection labelledBy="research-inputs">
      <div className="max-w-[640px]">
        <h2
          id="research-inputs"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          One pile, three kinds of file.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          A literature review is rarely just PDFs. Your notes and your numbers go in the same bundle,
          so the model reasons over the reading and the evidence at once.
        </p>
      </div>

      <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.label}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-ink text-[15px] font-semibold">{k.label}</h3>
              <span className="text-code font-mono text-[11px]">{k.exts}</span>
            </div>
            <div className="bg-hairline mt-2 h-px" />
            <p className="text-ink-secondary mt-2 text-[13.5px] leading-relaxed">{k.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 max-w-[720px]">
        <InfoCard tone="info" icon={ScanLine} title="Scanned and heavy two-column PDFs read poorly">
          <p>
            Text is pulled from the PDF layer, not from the pixels. A scan with no text layer comes
            through flagged as empty rather than dropped, and a dense two-column layout can arrive
            out of order. There is no OCR step yet.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" tone="alt" labelledBy="research-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="research-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A review folder, packed and counted.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          Three papers, a note file, and a results table go in. One document comes out, labeled as
          documents, with the token count already known.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="attention-survey/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`attention-survey/\n`}
              {`|-- papers/\n`}
              {`|   |-- vaswani-2017.pdf\n`}
              {`|   |-- devlin-2019.pdf\n`}
              {`|   \`-- brown-2020.pdf\n`}
              {`|-- notes.md\n`}
              {`\`-- benchmarks.csv`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="attention-survey.txt" trailing={<TokenChip value="96,300" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"attention-survey"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a set\nof documents, assembled by\nfileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 5.\n`}</span>
              <span className="text-ink-faint">{`</summary>\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

function TokenChip({ value }: { value: string }) {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">~{value}</span>
      <span className="text-ink-faint"> tokens</span>
    </span>
  );
}

function ClosingCta() {
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="research-cta" className="text-center">
      <h2
        id="research-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Fit the whole literature in one prompt.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your reading folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
