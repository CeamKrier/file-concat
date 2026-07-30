import { ArrowRight, ArrowUp, Check, Lock, ScanLine } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { ACCOUNTANTS_FAQ } from "./accountants-faq";

/**
 * /for/accountants — the Accountant persona page (ADR-0006). Leads with the
 * confidentiality of client financials, this persona's real constraint and the
 * one defensible difference (ADR-0003, fully local extraction), then leans on the
 * fact that statements and spreadsheets are read as text. Reads distinctly from
 * /for/legal by centering financial documents and tables. Hosts the real app flow
 * via AppFlow's renderLanding slot. Grammar stays clean; the raw search query is
 * never mirrored verbatim.
 */
export function AccountantsPage() {
  return <AppFlow renderLanding={(dropProps) => <AccountantsLanding {...dropProps} />} />;
}

function AccountantsLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Confidentiality />
      <Workflow />
      <FileTypes />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Nothing is uploaded",
  "Statements and spreadsheets read as text",
  "Client data stays on your computer",
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
            Combine a client&rsquo;s books for AI, privately.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop the folder of statements, invoices, and ledgers. FileConcat reads the PDFs and
            spreadsheets right here in your browser and gives back one file for ChatGPT, Claude, or
            Gemini. Nothing is uploaded, so client data stays on your machine.
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
            title="Drag your client folder here"
            hint="Statements, invoices, and ledgers. Read in a second."
          />
        </div>
      </div>
    </section>
  );
}

function Confidentiality() {
  return (
    <MarketingSection
      labelledBy="acct-confidential"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="acct-confidential"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          The numbers never leave your computer.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Most tools that read a document upload it to a server first. FileConcat does the reading
          in this browser tab. Nothing is sent, nothing is stored, and there is no account to
          create. You can open your own network panel and watch: after the page loads, working
          through a client folder sends zero requests.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Lock className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Suitable for confidential client and engagement records
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="acme-fy25 · handled locally">
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">22 files read in this tab</span>
            </li>
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">
                values pulled from 9 PDFs and 6 spreadsheets
              </span>
            </li>
            <li className="flex items-center gap-3 bg-[oklch(var(--primary)/0.06)] px-4 py-3">
              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
              <span className="text-ink min-w-0 flex-1">0 bytes sent to any server</span>
              <span className="text-go-fg shrink-0">private</span>
            </li>
          </ul>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the client folder",
    body: "Pull in a whole client at once, or a single engagement. Subfolders of statements and workpapers come along.",
  },
  {
    title: "It reads and cleans",
    body: "Statements, ledgers, and letters are turned into text. Duplicates and system noise are left out.",
  },
  {
    title: "Paste into your assistant",
    body: "Out comes one file, a file tree at the top, ready for ChatGPT, Claude, or Gemini.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="acct-workflow">
      <h2
        id="acct-workflow"
        className="font-display text-ink max-w-[24ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        From a client folder to a prompt in three steps.
      </h2>

      <ol className="mt-9 grid gap-x-8 gap-y-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="text-primary-foreground bg-primary font-display inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <ArrowUp
                  className="text-ink-faint hidden h-4 w-4 rotate-90 sm:block"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
            </div>
            <h3 className="font-display text-ink mt-4 text-[15px] font-semibold">{step.title}</h3>
            <p className="text-ink-secondary mt-1.5 text-[14px] leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </MarketingSection>
  );
}

const READS = [
  { ext: "PDF", note: "bank and card statements, tax forms" },
  { ext: "XLSX", note: "ledgers, trial balances, workbooks" },
  { ext: "CSV", note: "transaction and payroll exports" },
  { ext: "DOCX", note: "engagement letters and notes" },
];

function FileTypes() {
  return (
    <MarketingSection labelledBy="acct-filetypes">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="acct-filetypes"
            className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            The formats a client&rsquo;s books arrive in.
          </h2>
          <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
            You do not have to export or convert anything first. Born-digital documents are read
            straight through, and it is the text and the numbers that go into the file, never the
            raw document.
          </p>
          <dl className="mt-6 space-y-2.5">
            {READS.map((r) => (
              <div key={r.ext} className="flex items-baseline gap-3">
                <dt className="text-code w-24 shrink-0 font-mono text-[12.5px]">{r.ext}</dt>
                <dd className="text-ink-secondary text-[14px]">{r.note}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 self-center">
          <InfoCard tone="info" icon={ScanLine} title="A scanned statement has no text to read">
            <p>
              A statement that is a photo or a scan, rather than a born-digital PDF, holds no text
              to pull. It comes through flagged as &ldquo;no text found&rdquo; so you can run it
              through OCR first. It is never dropped without telling you.
            </p>
          </InfoCard>
        </div>
      </div>
    </MarketingSection>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" tone="alt" labelledBy="acct-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="acct-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          One client, one file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder of statements and workbooks goes in. A single file comes out, labeled as
          documents so the model reads it as a client file, not as source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="acme-fy25/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`acme-fy25/\n`}
              {`├── statements/\n`}
              {`│   ├── jan-mar.pdf\n`}
              {`│   └── apr-jun.pdf\n`}
              {`├── ledger.xlsx\n`}
              {`├── invoices.csv\n`}
              {`└── tax-return.pdf`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="acme-fy25.txt" trailing={<TokenChip value="9,600" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"acme-fy25"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a set\nof documents, assembled by\nfileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 6.\n`}</span>
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
    <MarketingSection labelledBy="acct-faq">
      <h2
        id="acct-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {ACCOUNTANTS_FAQ.map((item) => (
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
    <MarketingSection tone="alt" labelledBy="acct-cta" className="text-center">
      <h2
        id="acct-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Read the whole client file without giving it away.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your client folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
