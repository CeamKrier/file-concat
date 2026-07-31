import { ArrowRight, ArrowUp, Check, FileStack, Lock, Users } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { HR_FAQ } from "./hr-faq";

/**
 * /for/hr — the HR persona page (ADR-0006). Leads with the confidentiality of
 * people's data, this persona's real constraint, then shows the two shapes HR
 * teams actually use: a policy set as one reference, and a batch of CVs screened
 * in one pass. Reads distinctly from /for/legal and /for/accountants by centering
 * employee PII and batch use. Hosts the real app flow via AppFlow's renderLanding
 * slot. Grammar stays clean; the raw search query is never mirrored verbatim.
 */
export function HrPage() {
  return <AppFlow renderLanding={(dropProps) => <HrLanding {...dropProps} />} />;
}

function HrLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Confidentiality />
      <UseCases />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Nothing is uploaded",
  "PDFs and Word files read as text",
  "Employee data stays on your computer",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs on your computer. Nothing uploaded.
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Bring HR documents to AI without exposing your people.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop the folder of policies, handbooks, and records, or a batch of CVs. FileConcat reads
            the PDFs and Word files right here in your browser and returns one file for ChatGPT,
            Claude, or Gemini. Nothing is uploaded, so employee data stays on your machine.
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
            title="Drag your HR folder here"
            hint="Policies, handbooks, or a batch of CVs. Read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function Confidentiality() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="hr-confidential"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="hr-confidential"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Your people&rsquo;s data isn&rsquo;t uploaded.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          HR files are full of personal data, and most tools that read a document upload it to a
          server first. FileConcat does the reading in this browser tab, so the files are never
          uploaded to be read, and there is no account to create.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Lock className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Suitable for employee records and other personal data
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="q3-hiring · handled locally">
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">28 CVs read in this tab</span>
            </li>
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">
                text pulled from PDFs and Word files
              </span>
            </li>
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-3">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1">one file, ready to paste</span>
              <span className="text-go-fg shrink-0">no upload</span>
            </li>
          </ul>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

const CASES = [
  {
    icon: FileStack,
    title: "A policy set as one reference",
    body: "Combine the handbook, the policies, and the forms into one file, then hand it to a Project or a Gem so it answers staff questions from the whole set at once.",
  },
  {
    icon: Users,
    title: "A batch of CVs in one pass",
    body: "Combine a folder of CVs into one file and screen the whole batch against a role in a single prompt, instead of pasting one candidate at a time.",
  },
];

function UseCases() {
  return (
    <MarketingSection labelledBy="hr-usecases">
      <div className="max-w-[640px]">
        <h2
          id="hr-usecases"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Two ways HR teams reach for it.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Whether the goal is answering from a policy set or working through a stack of
          applications, the move is the same: many documents into one file the assistant can take in
          at once.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {CASES.map((c) => (
          <InfoCard key={c.title} tone="info" icon={c.icon} title={c.title}>
            <p>{c.body}</p>
          </InfoCard>
        ))}
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the folder",
    body: "Pull in the whole policy set, or the batch of CVs. Nested folders come along.",
  },
  {
    title: "It reads everything here",
    body: "PDFs and Word files are turned into text in this tab, with a file tree at the top. Nothing is uploaded.",
  },
  {
    title: "Paste into your assistant",
    body: "Out comes one file, ready for ChatGPT, Claude, or Gemini to answer from or screen against.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="hr-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="hr-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From an HR folder to a prompt.
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
    <MarketingSection id="example" labelledBy="hr-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="hr-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A policy set, packed into one file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder of policies and forms goes in. A single file comes out, labeled as documents so
          the assistant reads it as one reference, not as source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="people-handbook/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`people-handbook/\n`}
              {`├── policies/\n`}
              {`│   ├── leave.pdf\n`}
              {`│   └── remote-work.pdf\n`}
              {`├── handbook.docx\n`}
              {`├── code-of-conduct.pdf\n`}
              {`└── forms/`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="people-handbook.txt" trailing={<TokenChip value="14,200" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"people-handbook"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a set\nof documents, assembled by\nfileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 12.\n`}</span>
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
      <span className="text-primary">≈ {value}</span>
      <span className="text-ink-faint"> tokens</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="hr-faq">
      <h2
        id="hr-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {HR_FAQ.map((item) => (
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
    <MarketingSection labelledBy="hr-cta" className="text-center">
      <h2
        id="hr-cta"
        className="font-display text-ink mx-auto max-w-[22ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Put a whole policy set, or a stack of CVs, into one file.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your HR folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
