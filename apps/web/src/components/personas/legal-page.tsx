import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Lock, ScanLine } from "lucide-react";

import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow, SiteFooter, SiteHeader } from "~/components/app/marketing";

/**
 * /for/legal — the Legal persona page (ADR-0006). Confidentiality is the lede
 * because it is the persona's real constraint; the rest follows the four-part
 * anti-thinness contract (workflow, file types, worked example, hook). Kept
 * deliberately distinct from /for/researchers, which leads with token math.
 */
export function LegalPage() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Confidentiality />
        <Workflow />
        <FileTypes />
        <WorkedExample />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-16 sm:px-6 md:pt-20">
      <div className="max-w-[640px]">
        <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
          <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
          Runs on your computer. Nothing uploaded.
        </span>

        <h1 className="font-display text-ink mt-6 text-balance text-[clamp(2rem,5.4vw,2.9rem)] font-bold leading-[1.06] tracking-[-0.025em]">
          Bring a case file to ChatGPT or Claude. Privately.
        </h1>

        <p className="text-ink-secondary mt-5 max-w-[54ch] text-[17px] leading-relaxed">
          Drop the folder of contracts, filings, and rulings. FileConcat reads the PDFs and Word
          files right here in your browser and gives back one clean document to paste into your
          assistant. Nothing is uploaded, so privilege and client confidence stay intact.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to="/"
            className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Open FileConcat
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <a
            href="#example"
            className="border-border-strong text-ink bg-surface rounded-input focus-visible:ring-ring focus-visible:ring-offset-background hover:bg-accent inline-flex items-center justify-center border px-6 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            See a worked example
          </a>
        </div>
      </div>
    </section>
  );
}

function Confidentiality() {
  return (
    <MarketingSection
      labelledBy="legal-confidential"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="legal-confidential"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          The file never leaves your computer.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Most tools that read a document upload it to a server first. FileConcat does the reading in
          this browser tab. Nothing is sent, nothing is stored, and there is no account to create.
          You can open your own network panel and watch: after the page loads, working through a
          folder sends zero requests.
        </p>
        <p className="text-go-fg mt-5 inline-flex items-center gap-2 font-mono text-[12.5px]">
          <Lock className="text-primary h-4 w-4 shrink-0" strokeWidth={2} />
          Suitable for privileged and client-confidential material
        </p>
      </div>

      <div className="min-w-0">
        <MockWindow label="smith-v-acme · handled locally">
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">14 files read in this tab</span>
            </li>
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-primary shrink-0">✓</span>
              <span className="text-ink-secondary min-w-0 flex-1">
                text pulled from 9 PDFs and 3 Word files
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
    title: "Drop the case folder",
    body: "Pull in a whole matter at once, or paste a link. Subfolders of exhibits come along.",
  },
  {
    title: "It reads and cleans",
    body: "PDFs, filings, and Word files are turned into text. System noise and duplicates are left out.",
  },
  {
    title: "Paste into your assistant",
    body: "Out comes one document, a file tree at the top, ready for ChatGPT, Claude, or Gemini.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="legal-workflow">
      <h2
        id="legal-workflow"
        className="font-display text-ink max-w-[24ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        From a folder to a prompt in three steps.
      </h2>

      <ol className="mt-9 grid gap-x-8 gap-y-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="text-primary-foreground bg-primary font-display inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="text-ink-faint hidden h-4 w-4 sm:block"
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
  { ext: "PDF", note: "contracts, filings, rulings" },
  { ext: "DOCX", note: "Word drafts and memos" },
  { ext: "XLSX", note: "exhibit and damages tables" },
  { ext: "TXT / MD", note: "notes and transcripts" },
];

function FileTypes() {
  return (
    <MarketingSection labelledBy="legal-filetypes">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="legal-filetypes"
            className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            The formats a matter actually arrives in.
          </h2>
          <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
            You do not have to convert anything first. Born-digital documents are read straight
            through, and the text is what goes into the bundle, never the raw file.
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
          <InfoCard tone="info" icon={ScanLine} title="Scanned pages need OCR, which is not here yet">
            <p>
              A filing that is a photo of paper, rather than a born-digital PDF, has no text to pull.
              It comes through flagged as &ldquo;no text found&rdquo; so you can send it for OCR
              first. It is never dropped without telling you.
            </p>
          </InfoCard>
        </div>
      </div>
    </MarketingSection>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" tone="alt" labelledBy="legal-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="legal-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          One matter, one document.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder of five documents goes in. A single file comes out, labeled as documents so the
          model reads it as a matter, not source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="smith-v-acme/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`smith-v-acme/\n`}
              {`├── complaint.pdf\n`}
              {`├── answer.pdf\n`}
              {`├── exhibits/\n`}
              {`│   ├── exhibit-a.docx\n`}
              {`│   └── damages.xlsx\n`}
              {`└── ruling.pdf`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="smith-v-acme.txt" trailing={<TokenChip value="8,240" />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"smith-v-acme"`}</span>
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
      <span className="text-primary">≈ {value}</span>
      <span className="text-ink-faint"> tokens</span>
    </span>
  );
}

function ClosingCta() {
  return (
    <MarketingSection labelledBy="legal-cta" className="text-center">
      <h2
        id="legal-cta"
        className="font-display text-ink mx-auto max-w-[18ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Read the whole file without giving it away.
      </h2>
      <div className="mt-8">
        <Link
          to="/"
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Open FileConcat
          <FileText className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      </div>
    </MarketingSection>
  );
}
