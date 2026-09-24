import { Link } from "@tanstack/react-router";
import { ArrowUp, Check, FileStack, Lock } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { FurtherReading, ProseLink } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";

import { FAQ_ITEMS } from "./faq-data";

/**
 * /how-to/share-all-files-with-ai: the limits hub. Since 2026-09-24 it answers
 * what people type ("chatgpt file upload limit", "how many files can I upload
 * to claude") with every cap in one dated, sourced table, and each row links to
 * the page that gets past that cap. The URL stays for its history. Count
 * questions rarely click, so the hub's job is the links; the tool still sits in
 * the hero via AppFlow's renderLanding slot.
 */
export function ShareAllFilesPage() {
  return <AppFlow renderLanding={(dropProps) => <ShareLanding {...dropProps} />} />;
}

function ShareLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <Limits />
      <HowItWorks />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "No sign-up, no install",
  "Nothing uploaded to us, not even PDFs",
  "One file back in about a second",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in your browser. Nothing uploaded to us.
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            AI file upload limits, and a way past each one.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            ChatGPT, Claude, Gemini and NotebookLM each cap what you can add: a number of files, a
            size per file, or a total. The table below has every cap with its source. Drop your
            folder here and it comes back as one file, read in your browser, PDFs included, with
            its token count shown.
          </p>

          <ul className="mt-6 space-y-2">
            {TRUST.map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2 text-[14px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <DropZone
            {...dropProps}
            title="Drag your folder here"
            hint="Files, PDFs, docs, a whole folder. Read in a second."
          />
        </div>
      </div>
    </section>
  );
}

/** Live per-platform caps, the substance a search lands on. Every figure is
 * pinned to the vendor sentence it was read from in src/data/vendor-caps.json,
 * which the build re-checks. Rows with a page link to the page that gets past
 * that cap. Gone on 2026-09-24: "10 files in one pass" for ChatGPT Projects,
 * which a Plus account disproved on 2026-09-14 (11 went in at once; see
 * chatgpt-projects-page.tsx). */
const LIMITS = [
  {
    where: "ChatGPT uploads",
    caps: "Files you send, in any chat",
    limit: "80 every 3 hours, 3 a day on Free",
    href: "/how-to/chatgpt-file-upload-limit",
  },
  { where: "ChatGPT, one file", caps: "Size and length", limit: "512 MB, 2M tokens" },
  {
    where: "ChatGPT folders and ZIPs",
    caps: "What it opens",
    limit: "No folder upload; archives are not a listed file type",
    href: "/how-to/upload-folder-to-chatgpt",
  },
  {
    where: "A book or textbook",
    caps: "EPUB and long PDFs",
    limit: "EPUB not named by ChatGPT; Claude takes PDFs up to 1,000 pages",
    href: "/how-to/upload-book-to-chatgpt",
  },
  {
    where: "ChatGPT Projects",
    caps: "Files per project",
    limit: "5 free, 25 on Go and Plus, 40 on Pro and above",
    href: "/for/chatgpt-projects",
  },
  { where: "Custom GPTs", caps: "Knowledge files", limit: "20, until GPTs retire in December 2026" },
  {
    where: "Claude chats",
    caps: "Files you attach",
    limit: "20 per chat, up to 500 MB each",
    href: "/how-to/claude-file-upload-limit",
  },
  {
    where: "Claude Projects",
    caps: "Project knowledge",
    limit: "The context window, not a file count; 30 MB per file",
    href: "/for/claude-projects",
  },
  {
    where: "Gemini chats",
    caps: "Files in one prompt",
    limit: "10, up to 100 MB each; one repository of up to 5,000 files",
  },
  { where: "Gemini Gems", caps: "Knowledge files", limit: "About 10", href: "/for/gemini-gems" },
  {
    where: "NotebookLM",
    caps: "Sources per notebook",
    limit: "50 free, 100 on Plus, 300 on Pro",
    href: "/for/notebooklm",
  },
  {
    where: "NotebookLM, one source",
    caps: "Size of a source",
    limit: "500,000 words or 200 MB",
    href: "/for/notebooklm",
  },
];

function Limits() {
  return (
    <MarketingSection tone="alt" labelledBy="the-limits">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="the-limits"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Every AI file upload limit, in one table.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Where a cap counts files, one combined file takes one slot. Where it counts size, the
          token count shows what to leave out. Each linked row has its own page.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[760px] overflow-x-auto">
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
            {LIMITS.map((row) => (
              <tr key={row.where} className="border-hairline border-b">
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
        Figures as of September 2026, and providers change them often. Check the current cap in each
        provider's help center:{" "}
        <SourceLink href="https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt">
          OpenAI
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.claude.com/en/articles/9517075-what-are-projects">
          Anthropic
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.google.com/gemininotebook/answer/16213268">
          NotebookLM
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.google.com/gemini/answer/14903178">Gemini</SourceLink>.
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

const STEPS = [
  {
    title: "Drop the whole folder",
    body: "Drag in everything you want the AI to read. Subfolders come along, and you can add a repo or a link too.",
  },
  {
    title: "It reads everything here",
    body: "PDFs, Word, Excel, code, and notes are turned into text right in this tab. Nothing is uploaded to us.",
  },
  {
    title: "Paste the one file in",
    body: "Copy the single file and paste it into ChatGPT, Claude, or Gemini, with its token count already known. For a ChatGPT or Claude project, set Format to Plain and upload the .txt, a type both list.",
  },
];

function HowItWorks() {
  return (
    <MarketingSection labelledBy="how-it-works">
      <h2
        id="how-it-works"
        className="font-display text-ink max-w-[24ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        From a full folder to one file to paste.
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

      <div className="mt-10 max-w-[760px]">
        <InfoCard tone="info" icon={FileStack} title="One upload beats twenty">
          <p>
            Adding files one by one runs into the count caps above and scatters them across
            separate uploads. A single file keeps every document together, in order, so the
            assistant reads the whole set as one thing.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="faq">
      <h2
        id="faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {FAQ_ITEMS.map((item) => (
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
    <MarketingSection labelledBy="share-cta" className="text-center">
      <h2
        id="share-cta"
        className="font-display text-ink mx-auto max-w-[18ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Get all your files into one, and past the limit.
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
      <FurtherReading>
        The longer version of this job, with the three ways compared side by side, is{" "}
        <ProseLink to="/blog/combine-files-for-llm">how to combine multiple files into one</ProseLink>
        .
      </FurtherReading>
    </MarketingSection>
  );
}
