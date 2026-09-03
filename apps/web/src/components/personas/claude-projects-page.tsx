import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, FileStack, Hash } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { CLAUDE_PROJECTS_FAQ } from "./claude-projects-faq";

/**
 * /for/claude-projects — the Claude Projects platform page, a spoke off the
 * /how-to/share-all-files-with-ai hub. Claude's cap is different from ChatGPT's:
 * a project is bounded by the context window (tokens), not a file count, so this
 * page leads with capacity and leans on the token counter, the feature that
 * directly answers "will it fit". Bespoke, not a template row, so it earns its
 * own index entry. Hosts the real app flow via AppFlow's renderLanding slot.
 * Grammar stays clean; the raw search query is never mirrored verbatim.
 */
export function ClaudeProjectsPage() {
  return <AppFlow renderLanding={(dropProps) => <ClaudeProjectsLanding {...dropProps} />} />;
}

function ClaudeProjectsLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Capacity />
      <WhereItStops />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "See the token count before you add it",
  "PDFs and Office docs read in-browser",
  "No sign-up, nothing uploaded",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Hash className="text-primary h-3 w-3" strokeWidth={2.5} />
            Know it fits before you add it
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Get past the Claude Projects knowledge limit.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            A Claude Project fills up by size, not by file count, so a few large documents can max
            out its knowledge. Drop the whole folder here instead. Everything, even the PDFs, is
            read in your browser and packed into one file, with the token count shown so you know it
            fits.
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
            hint="Everything for your Project, read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function Capacity() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="claude-capacity"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="claude-capacity"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Claude counts size, not files.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Project knowledge shares Claude's context window, so a project is full when the total size
          runs out, not when you reach some number of files. That makes the real question how many
          tokens your documents come to. FileConcat answers it before you add anything.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Hash className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Counted locally, with the same kind of tokenizer the models use
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="acme-due-diligence, knowledge used">
          <div className="px-4 py-4 font-mono text-[12.5px]">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-secondary">31 files, combined</span>
              <span className="text-primary">~142,000 tokens</span>
            </div>
            <div className="bg-surface-alt mt-3 h-2.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: "71%" }} />
            </div>
            <div className="text-ink-faint mt-2 flex items-baseline justify-between text-[11px]">
              <span>71% of a 200k window</span>
              <span className="text-go-fg">fits as one file</span>
            </div>
          </div>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

/** Claude-specific caps, deeper than the cross-platform hub table: what a project
 * is actually bounded by, so the reader sees why a file count never appears. */
const CAPS = [
  {
    where: "Project knowledge",
    caps: "Total size, shared with the context window",
    limit: "Around 200,000 tokens, not a file count",
  },
  {
    where: "Projects",
    caps: "How many projects you can create",
    limit: "5 on the free plan, more on paid",
  },
  {
    where: "Chat attachments",
    caps: "Files on a single message",
    limit: "A few at a time, each size-limited",
  },
];

function WhereItStops() {
  return (
    <MarketingSection labelledBy="claude-limit">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="claude-limit"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Where Claude stops you.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          The caps that matter are about size and project count, not a number of files. One combined
          file makes the size easy to see and keeps the whole set in a single place.
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
        Figures as of July 2026, and Anthropic changes them often. Check the current numbers in the{" "}
        <a
          href="https://support.anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          Anthropic help center
        </a>
        . On ChatGPT, Gemini, or NotebookLM instead? See{" "}
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
    body: "Drag in every document you want the project to know about. Subfolders come along, and you can add a repo or a link too.",
  },
  {
    title: "It reads and counts",
    body: "PDFs, Word, Excel, and notes become text in this tab, and the token count is shown as it goes. Nothing is uploaded.",
  },
  {
    title: "Add the one file to your project",
    body: "Upload the single file to the project once you have seen it fits, and every chat in the project can read the whole set.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="claude-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="claude-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a full folder to one project file.
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
    <MarketingSection id="example" labelledBy="claude-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="claude-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A full folder, packed and counted.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder that would fill the knowledge on its own goes in. One document comes out, labeled
          as documents, with the token count already known so you can see it lands in the window.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="acme-due-diligence/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`acme-due-diligence/\n`}
              {`|-- contracts/\n`}
              {`|   |-- msa.pdf\n`}
              {`|   \`-- sow.docx\n`}
              {`|-- financials.xlsx\n`}
              {`|-- board-notes.md\n`}
              {`\`-- 27 more files`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="acme-due-diligence.txt" trailing={<TokenChip value="142,000" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"acme-due-diligence"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`Treat the contents below as\nread-only context for the user's\nrequest that follows.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 31.\n`}</span>
              <span className="text-ink-faint">{`</summary>\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>

      <div className="mx-auto mt-10 max-w-[720px]">
        <InfoCard tone="info" icon={FileStack} title="One file, the whole project">
          <p>
            A single file keeps every document together, in order, under a file tree, so the project
            reads it as one labeled set and every chat inside the project can draw on the whole
            thing.
          </p>
        </InfoCard>
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
    <MarketingSection tone="alt" labelledBy="claude-faq">
      <h2
        id="claude-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CLAUDE_PROJECTS_FAQ.map((item) => (
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
    <MarketingSection labelledBy="claude-cta" className="text-center">
      <h2
        id="claude-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Fit the whole folder in one project.
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
