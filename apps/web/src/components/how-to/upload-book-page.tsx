import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, BookOpen, Check } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";

import { BOOK_TOKENS, UPLOAD_BOOK_FAQ } from "./upload-book-faq";

/**
 * /how-to/upload-book-to-chatgpt: an EPUB or a textbook PDF into ChatGPT, and
 * the same book into Claude, Gemini or NotebookLM. The searcher types "upload
 * book to chatgpt" or "can chatgpt read epub", so the page answers that first
 * (EPUB is not a type OpenAI names; long PDFs meet page and size caps) and then
 * does the job in place. Sources and the measured example are in
 * upload-book-faq.ts. Hosts the real app flow via AppFlow's renderLanding slot.
 */
export function UploadBookPage() {
  return <AppFlow renderLanding={(dropProps) => <UploadBookLanding {...dropProps} />} />;
}

function UploadBookLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <WhereABookStops />
      <WorkedExample />
      <Workflow />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "EPUB and PDF read in your browser",
  "Token count shown before you upload",
  "No sign-up, nothing uploaded to us",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <BookOpen className="text-primary h-3 w-3" strokeWidth={2.5} />
            EPUB or PDF in, one text file out
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Upload a whole book or textbook to ChatGPT.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            EPUB is not among the file types OpenAI names, and a long textbook PDF runs into page and
            size caps elsewhere. Drop the EPUB or the PDF here: the text is read in your browser and
            comes back as one text file, with its token count, that any assistant reads.
          </p>

          <ul className="mt-6 space-y-2">
            {TRUST.map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2 text-[14px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>

          <p className="text-ink-faint mt-5 max-w-[52ch] text-[12.5px] leading-relaxed">
            Upload only books you have the right to use, such as public-domain titles or your own
            writing.
          </p>
        </div>

        <div className="min-w-0">
          <DropZone
            {...dropProps}
            title="Drag your EPUB or PDF here"
            hint="One book or several, read in your browser."
          />
        </div>
      </div>
    </section>
  );
}

/** What a whole book meets in each assistant, read on 2026-09-24 (sources in
 * upload-book-faq.ts). Gemini's page says it supports "most file types", so no
 * EPUB claim is made for it. */
const CAPS = [
  {
    where: "ChatGPT",
    caps: "EPUB, and one file",
    limit: "EPUB is not a named type; 512 MB and 2M tokens per file",
    href: "/how-to/chatgpt-file-upload-limit",
  },
  {
    where: "Claude chats",
    caps: "A PDF",
    limit: "Up to 1,000 pages and 500 MB; EPUB is read",
    href: "/for/claude-projects",
  },
  {
    where: "Claude Projects",
    caps: "One file, and the project",
    limit: "30 MB per file, all of it within the context window",
    href: "/for/claude-projects",
  },
  { where: "Gemini chats", caps: "One file", limit: "Up to 100 MB" },
  {
    where: "NotebookLM",
    caps: "One source",
    limit: "500,000 words or 200 MB; EPUB is read",
    href: "/for/notebooklm",
  },
];

function WhereABookStops() {
  return (
    <MarketingSection tone="alt" labelledBy="book-caps">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="book-caps"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Where a book stops in ChatGPT, Claude and NotebookLM.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Once a book is text, what is left to check is its size. Before that, what stops it is a
          format one assistant does not name, or a page or size cap on the PDF.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[760px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Where
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
              <tr key={row.where} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">
                  {row.href ? (
                    <Link
                      to={row.href}
                      className="hover:text-primary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
                    >
                      {row.where}
                    </Link>
                  ) : (
                    row.where
                  )}
                </td>
                <td className="text-ink-secondary py-3 pr-4">{row.caps}</td>
                <td className="text-ink-secondary py-3">{row.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[760px] text-[12.5px] leading-relaxed">
        As of September 2026, from the help centers of{" "}
        <SourceLink href="https://help.openai.com/en/articles/8983675-what-types-of-files-are-supported">
          OpenAI
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.claude.com/en/articles/8241126-upload-files-to-claude">
          Anthropic
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.google.com/gemini/answer/14903178">Gemini</SourceLink> and{" "}
        <SourceLink href="https://support.google.com/gemininotebook/answer/16215270">
          NotebookLM
        </SourceLink>
        . Every other cap is in{" "}
        <Link
          to="/how-to/share-all-files-with-ai"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          the AI file upload limits table
        </Link>
        .
      </p>
    </MarketingSection>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
    >
      {children}
    </a>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="book-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="book-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A whole novel, counted.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Project Gutenberg's EPUB of Pride and Prejudice, 558 KB without images, came back as one
          text file of {BOOK_TOKENS} tokens, estimated, when we ran it on 24 September 2026. That
          fits a 200K window with room left for your questions.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="pride-and-prejudice.epub">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`pride-and-prejudice.epub\n`}
              {`558 KB, no images\n`}
              {`from gutenberg.org/ebooks/1342`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="pride-and-prejudice.txt" trailing={<TokenChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`Documents: `}</span>
              <span className="text-go-fg">{`pride-and-prejudice\n\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a\nset of documents...\n`}
              </span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

function TokenChip() {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">~{BOOK_TOKENS}</span>
      <span className="text-ink-faint"> tokens</span>
    </span>
  );
}

const STEPS = [
  {
    title: "Drop the EPUB or the PDF",
    body: "One book, or several at once. Each keeps its own name inside the combined file.",
  },
  {
    title: "It reads the text here",
    body: "EPUB chapters and the PDF's text layer become plain text in this tab. Nothing is uploaded to us.",
  },
  {
    title: "Check the count against your model",
    body: "The result shows the token count and the share of a model's context window it takes. Click the model's name to compare another.",
  },
  {
    title: "Upload the one text file",
    body: "Set Format to Plain and download the .txt, a type ChatGPT, Claude and NotebookLM all list. Attach it to a chat or a project, or add it as a NotebookLM source.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="book-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="book-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Upload a book to ChatGPT in four steps.
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

      <div className="mt-10 max-w-[760px]">
        <InfoCard tone="info" icon={BookOpen} title="Text, not pages">
          <p>
            A text file has no page count, so a PDF page cap no longer applies to it. What is left to
            check is the size and the context window, and the count on the result screen covers
            both.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function Faq() {
  return (
    <MarketingSection labelledBy="book-faq">
      <h2
        id="book-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {UPLOAD_BOOK_FAQ.map((item) => (
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
    <MarketingSection tone="alt" labelledBy="book-cta" className="text-center">
      <h2
        id="book-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Hand the assistant the whole book.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your book
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        Text out of a PDF, and what gets lost on the way:{" "}
        <ProseLink to="/blog/convert-pdf-to-text-for-llm">converting a PDF to text for an LLM</ProseLink>
        .
      </FurtherReading>
    </MarketingSection>
  );
}
