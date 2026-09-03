import { ArrowRight, ArrowUp, Check, Layers, Presentation } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { CONSULTANTS_FAQ } from "./consultants-faq";

/**
 * /for/consultants — the Consultant persona page (ADR-0006). Leads with synthesis
 * breadth: an engagement spans decks, reports, and data, and the value is reading
 * across all of it at once. Reads distinctly from /for/legal (confidentiality) and
 * /for/accountants (financial tables) by centering mixed-format synthesis, decks
 * especially. Hosts the real app flow via AppFlow's renderLanding slot. Grammar
 * stays clean; the raw search query is never mirrored verbatim.
 */
export function ConsultantsPage() {
  return <AppFlow renderLanding={(dropProps) => <ConsultantsLanding {...dropProps} />} />;
}

function ConsultantsLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Synthesis />
      <Workflow />
      <Inputs />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Slides, PDFs, and spreadsheets read as text",
  "One file for the whole engagement",
  "Nothing is uploaded",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Layers className="text-primary h-3 w-3" strokeWidth={2.5} />
            One engagement, one context
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Turn a whole engagement into one AI context.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop the decks, reports, interview notes, and data from the whole project. FileConcat
            reads the PDFs, slides, and spreadsheets in your browser and packs them into one file
            for ChatGPT, Claude, or Gemini. Nothing is uploaded, so client material stays yours.
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
            title="Drag your engagement folder here"
            hint="Decks, reports, and data. Read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function Synthesis() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="cons-synthesis"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="cons-synthesis"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          The whole engagement, in one place.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          The work of an engagement is scattered across a deck, a research report, a spreadsheet,
          and a pile of notes. Feeding them to a model one at a time loses the thread. One combined
          file lets the assistant reason over the deck, the report, and the data together.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Layers className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />A file tree at the top
          keeps every document labeled
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="acme-growth, one context">
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span className="text-ink-secondary min-w-0 flex-1">strategy deck, 34 slides</span>
            </li>
            <li className="flex items-center gap-3 px-4 py-2.5">
              <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span className="text-ink-secondary min-w-0 flex-1">market report and model</span>
            </li>
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-3">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1">read together as one file</span>
              <span className="text-go-fg shrink-0">in order</span>
            </li>
          </ul>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the engagement folder",
    body: "Pull in the decks, reports, notes, and data at once. Nested folders for each workstream are fine.",
  },
  {
    title: "Every file becomes text",
    body: "Slides, PDFs, and spreadsheets are read in this tab, boilerplate is dropped, and duplicates are left out.",
  },
  {
    title: "One file, ready to reason over",
    body: "You get a single file, labeled as documents, ready to paste into ChatGPT, Claude, or Gemini.",
  },
];

function Workflow() {
  return (
    <MarketingSection labelledBy="cons-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="cons-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a full engagement to a prompt.
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
  { label: "Decks", exts: "PPTX, PDF", note: "strategy and steering decks" },
  { label: "Reports", exts: "PDF, DOCX", note: "research reports and proposals" },
  { label: "Data", exts: "XLSX, CSV", note: "models and benchmark tables" },
  { label: "Notes", exts: "MD, TXT", note: "interview and workshop notes" },
];

function Inputs() {
  return (
    <MarketingSection tone="alt" labelledBy="cons-inputs">
      <div className="max-w-[640px]">
        <h2
          id="cons-inputs"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Four kinds of file, one engagement.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          An engagement is never just slides. The report and the numbers go in the same file, so the
          model reasons over the story and the evidence at once.
        </p>
      </div>

      <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <InfoCard tone="info" icon={Presentation} title="Slides come through as text, not visuals">
          <p>
            Titles, bullets, and speaker notes are pulled from each slide, so the argument survives.
            A chart or diagram that is only an image is not described, since there is no OCR step
            yet.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="cons-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="cons-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          An engagement, packed into one file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder of decks, a report, and a model goes in. One file comes out, labeled as documents
          so the model reads it as an engagement, not as source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="acme-growth/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`acme-growth/\n`}
              {`|-- decks/\n`}
              {`|   |-- kickoff.pptx\n`}
              {`|   \`-- final.pptx\n`}
              {`|-- market-report.pdf\n`}
              {`|-- model.xlsx\n`}
              {`\`-- interviews.md`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="acme-growth.txt" trailing={<TokenChip value="41,800" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"acme-growth"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`Treat the contents below as\nread-only context for the user's\nrequest that follows.\n`}
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

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="cons-faq">
      <h2
        id="cons-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CONSULTANTS_FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-display text-ink text-[16px] font-semibold">{item.q}</dt>
            <dd className="text-ink-secondary mt-2 text-[14.5px] leading-relaxed">{item.a}</dd>
          </div>
        ))}
      </dl>
    </MarketingSection>
  );
}

function ClosingCta() {
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="cons-cta" className="text-center">
      <h2
        id="cons-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Reason over the whole engagement at once.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your engagement folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
