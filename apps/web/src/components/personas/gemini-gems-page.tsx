import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, FileStack, Sparkles } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { GEMINI_GEMS_FAQ } from "./gemini-gems-faq";

/**
 * /for/gemini-gems — the Gemini Gems platform page, a spoke off the
 * /how-to/share-all-files-with-ai hub. A Gem caps knowledge files at a low count,
 * so this page leads with "one slot holds the whole set". Bespoke, not a template
 * row, so it earns its own index entry. Hosts the real app flow via AppFlow's
 * renderLanding slot. Grammar stays clean; the raw search query is never mirrored
 * verbatim.
 */
export function GeminiGemsPage() {
  return <AppFlow renderLanding={(dropProps) => <GeminiGemsLanding {...dropProps} />} />;
}

function GeminiGemsLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <OneSlot />
      <WhereItStops />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "The whole set takes one slot",
  "PDFs and Office docs read in-browser",
  "No sign-up, nothing uploaded",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Sparkles className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in your browser. Nothing uploaded.
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Get past the Gemini Gems file limit.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            A Gem holds only a handful of knowledge files, so you end up choosing which few to keep.
            Drop the whole folder here instead. Everything, even the PDFs, is read in your browser
            and packed into one file, so all your reference documents take a single knowledge slot.
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
            title="Drag your folder here"
            hint="Everything for your Gem, read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function OneSlot() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="gemini-oneslot"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="gemini-oneslot"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Stop choosing which ten to keep.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          With only a handful of knowledge slots, a Gem forces you to leave documents out. One
          combined file changes the math: however many documents you started with, the Gem sees them
          as a single knowledge file, so nothing gets cut and the slots stay free.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Sparkles className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />A file tree at the
          top keeps every document labeled
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="brand-assistant · knowledge">
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-ink-faint shrink-0">before</span>
              <span className="text-ink-secondary min-w-0 flex-1">18 documents, over the cap</span>
              <span className="text-ink-faint shrink-0">10 max</span>
            </li>
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-3">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1">18 documents, 1 knowledge file</span>
              <span className="text-go-fg shrink-0">fits</span>
            </li>
          </ul>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

/** Gemini-specific caps, deeper than the cross-platform hub table: the two places
 * a Gem and the app itself hold you to about ten files. */
const CAPS = [
  { where: "Gem knowledge files", caps: "Files a Gem can reference", limit: "About 10" },
  {
    where: "Files per prompt",
    caps: "Attachments on a single message",
    limit: "About 10 at a time",
  },
];

function WhereItStops() {
  return (
    <MarketingSection labelledBy="gemini-limit">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="gemini-limit"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Where Gemini stops you.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Both a Gem and a single prompt hold you to about ten files. One combined file stays under
          either cap, because it is one file no matter how many documents went into it.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[720px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Where you add files
              </th>
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What it caps
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Limit today
              </th>
            </tr>
          </thead>
          <tbody>
            {CAPS.map((row) => (
              <tr key={row.where} className="border-hairline border-b">
                <td className="text-ink py-3 pr-4 font-medium">{row.where}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.caps}</td>
                <td className="text-ink-secondary py-3">{row.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[720px] text-[12.5px] leading-relaxed">
        Figures as of July 2026, and Google changes them often. Check the current numbers in the{" "}
        <a
          href="https://support.google.com/gemini"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          Gemini help center
        </a>
        . On ChatGPT, Claude, or NotebookLM instead? See{" "}
        <Link
          to="/how-to/share-all-files-with-ai"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          how to share all your files with any AI
        </Link>
        .
      </p>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the whole folder",
    body: "Drag in every document you want the Gem to know. Subfolders come along, and you can add a repo or a link too.",
  },
  {
    title: "It reads everything here",
    body: "PDFs, Word, Excel, and notes are turned into text in this tab, with a file tree at the top. Nothing is uploaded.",
  },
  {
    title: "Add the one file to your Gem",
    body: "Upload the single file as the Gem's knowledge, and it draws on the whole set from one slot in every conversation.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="gemini-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="gemini-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a full folder to one Gem file.
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

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="gemini-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="gemini-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Eighteen documents, one Gem file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder that would blow past the knowledge cap goes in. A single file comes out, labeled
          as documents so the Gem reads it as one set, not as source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="brand-assistant/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`brand-assistant/\n`}
              {`├── guidelines/\n`}
              {`│   ├── voice.pdf\n`}
              {`│   └── logo-usage.pdf\n`}
              {`├── product-facts.docx\n`}
              {`├── faqs.md\n`}
              {`└── 14 more files`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="brand-assistant.txt" trailing={<SlotChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"brand-assistant"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a set\nof documents, assembled by\nfileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 18.\n`}</span>
              <span className="text-ink-faint">{`</summary>\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>

      <div className="mx-auto mt-10 max-w-[720px]">
        <InfoCard tone="info" icon={FileStack} title="One slot, the whole set">
          <p>
            Whether it is five documents or fifty, the combined file counts as one knowledge file.
            The Gem reads it as a single labeled set and refers to the whole thing in every reply.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function SlotChip() {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">1</span>
      <span className="text-ink-faint"> knowledge file</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="gemini-faq">
      <h2
        id="gemini-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {GEMINI_GEMS_FAQ.map((item) => (
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
    <MarketingSection labelledBy="gemini-cta" className="text-center">
      <h2
        id="gemini-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Fit the whole folder into one Gem.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
