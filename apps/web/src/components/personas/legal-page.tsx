import { ArrowUp, Check, Lock, ScanLine } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

/**
 * /for/legal — the Legal persona page (ADR-0006). Hosts the real app flow: the
 * hero embeds a working DropZone (via AppFlow's renderLanding slot), so a drop
 * starts bundling in place instead of bouncing to the home route. Confidentiality
 * is the lede because it is the persona's real constraint; the rest follows the
 * four-part anti-thinness contract. Kept distinct from /for/researchers, which
 * leads with token math.
 */
export function LegalPage() {
  return <AppFlow renderLanding={(dropProps) => <LegalLanding {...dropProps} />} />;
}

function LegalLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Confidentiality />
      <Workflow />
      <FileTypes />
      <WorkedExample />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Nothing is uploaded",
  "PDFs and Word read as text",
  "Scanned pages flagged, never dropped",
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
            Bring a case file to ChatGPT or Claude. Privately.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Drop the folder of contracts, filings, and rulings. FileConcat reads the PDFs and Word
            files right here in your browser and gives back one clean document to paste into your
            assistant. Nothing is uploaded, so privilege and client confidence stay intact.
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
            title="Drag your case folder here"
            hint="Contracts, filings, and rulings. Read in a second."
          />
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
          We don&rsquo;t upload your case file.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Most tools that read a document upload it to a server first. FileConcat does the reading in
          this browser tab, so your file is never uploaded to be read, and there is no account to
          create.
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
              <span className="text-ink min-w-0 flex-1">one document, ready to paste</span>
              <span className="text-go-fg shrink-0">no upload</span>
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
          <ArrowUp className="hidden h-5 w-5 rotate-90 lg:block" strokeWidth={2} aria-hidden="true" />
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
  const toTop = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <MarketingSection labelledBy="legal-cta" className="text-center">
      <h2
        id="legal-cta"
        className="font-display text-ink mx-auto max-w-[18ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Read the whole file without giving it away.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your case folder
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </MarketingSection>
  );
}
