import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, Hash, MonitorSmartphone } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import type { DropZoneProps } from "~/components/app/drop-zone";
import { EntrySurface } from "~/components/app/entry-surface";
import type { ImportState } from "~/components/app/import-panel";
import { InfoCard } from "~/components/app/info-card";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";

import { CLAUDE_UPLOAD_LIMIT_FAQ } from "./claude-upload-limit-faq";

/**
 * /how-to/claude-file-upload-limit: the per-chat cap of 20 files, not the
 * project limit. The two walls in a Claude chat are the file count and the
 * length limit, and combining clears only the first, so the page says so and
 * leans on the token count for the second. /for/claude-projects keeps the
 * project error and links here for the chat cap. The refusal Claude shows on a
 * 21st file is not quoted anywhere on support.claude.com, so this page never
 * quotes it; the length-limit string is quoted because the help center prints
 * it. Hosts the real app flow via AppFlow's renderLanding slot.
 */
export function ClaudeUploadLimitPage() {
  return (
    <AppFlow
      renderLanding={(dropProps, linkImport) => (
        <Landing dropProps={dropProps} linkImport={linkImport} />
      )}
    />
  );
}

type LandingProps = { dropProps: DropZoneProps; linkImport: ImportState };

function Landing({ dropProps, linkImport }: LandingProps) {
  return (
    <>
      <Hero dropProps={dropProps} linkImport={linkImport} />
      <Limits />
      <LengthLimit />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** Read at the Claude help center on 2026-09-24 and pinned in vendor-caps.json.
 * Move the date below only when the figures are checked again. */
const CAPS_CHECKED = "September 2026";
const CLAUDE_UPLOADS_HELP = "https://support.claude.com/en/articles/8241126-upload-files-to-claude";
const CLAUDE_ERRORS_HELP =
  "https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages";
const CHAT_FILE_CAP = 20;

const TRUST = [
  "Hundreds of files become one attachment",
  "PDFs and Office docs read in your browser",
  "No sign-up, nothing uploaded to us",
];

function Hero({ dropProps, linkImport }: LandingProps) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <MonitorSmartphone className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in this tab
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Get past the Claude file upload limit per chat.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            Claude takes up to {CHAT_FILE_CAP} files per chat, according to its help center in{" "}
            {CAPS_CHECKED}. It counts files, not what is in them. Drop the whole folder here or
            paste a GitHub link: everything is read in your browser and comes back as one file, one
            of the {CHAT_FILE_CAP}, with its token count.
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
            See a measured example
          </a>
        </div>

        <div className="min-w-0">
          <EntrySurface {...dropProps} linkImport={linkImport} />
        </div>
      </div>
    </section>
  );
}

const CAPS = [
  { where: "A chat", caps: "Files you attach", limit: `Up to ${CHAT_FILE_CAP}` },
  { where: "One chat file", caps: "Size of a single file", limit: "500 MB" },
  {
    where: "A PDF",
    caps: "Pages",
    limit: "1,000; past 100 pages Claude reads the text only",
  },
  { where: "An image", caps: "Dimensions", limit: "8000 x 8000 pixels" },
  {
    where: "A project file",
    caps: "Size, with no file count",
    limit: "30 MB; together they must fit the context window",
  },
  {
    where: "The chat itself",
    caps: "Length of what you send",
    limit: "The context window: 200K to 1M tokens on paid plans, by model",
  },
];

function Limits() {
  return (
    <MarketingSection tone="alt" labelledBy="claude-upload-limits">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="claude-upload-limits"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          The Claude file upload limits.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Only the first row counts files, and one combined file takes one slot of it. The rest
          count size, which combining does not change.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[720px] overflow-x-auto">
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
                <td className="text-ink py-3 pr-4 font-medium">{row.where}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.caps}</td>
                <td className="text-ink-secondary py-3">{row.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[720px] text-[12.5px] leading-relaxed">
        Figures as of {CAPS_CHECKED}, from the Claude help center on{" "}
        <SourceLink href={CLAUDE_UPLOADS_HELP}>uploading files</SourceLink> and on{" "}
        <SourceLink href="https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans">
          the context window
        </SourceLink>
        . Anthropic changes them often. A project hits a different wall, its total size: see{" "}
        <Link
          to="/for/claude-projects"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          Project knowledge exceeds maximum
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

function LengthLimit() {
  return (
    <MarketingSection labelledBy="claude-length-limit">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="claude-length-limit"
            className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            The second wall is length, not count.
          </h2>
          <div className="mt-6">
            <InfoCard tone="info" icon={Hash} title="Counted before you send">
              <p>
                The result screen shows the combined file&apos;s token count and how much of the
                model&apos;s window it fills. It is an estimate: Claude&apos;s own count differs, so
                leave some room.
              </p>
            </InfoCard>
          </div>
        </div>

        <div className="text-ink-secondary min-w-0 space-y-4 text-[15px] leading-relaxed">
          <p>Past the file count, Claude can still refuse a message for its length:</p>
          <blockquote className="border-border-strong text-ink border-l-2 pl-4 font-mono text-[13.5px] leading-relaxed">
            Your message will exceed the length limit for this chat. Try attaching fewer or smaller
            files or starting a new conversation.
          </blockquote>
          <p>
            A combined file holds the same text as the files in it, so it is just as long. On paid
            plans with code execution on, Claude manages long conversations itself, but its{" "}
            <SourceLink href={CLAUDE_ERRORS_HELP}>help center</SourceLink> says a very large first
            message can still hit this error. If the count is near the window, leave out what Claude
            does not need under Adjust what&apos;s included, or pick a model with a larger window.
          </p>
        </div>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop everything",
    body: "Drag in the folder you meant to attach, subfolders included, or paste a public GitHub link.",
  },
  {
    title: "It reads and counts",
    body: "PDFs, Word, Excel and notes become text in this tab, and the token count shows whether the one file fits the chat. Nothing is uploaded to us.",
  },
  {
    title: "Attach the one file",
    body: "Set Format to Plain, download the .txt, and attach it to your chat: one of the twenty. Claude's help center lists TXT, not XML or Markdown.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="claude-upload-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="claude-upload-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a folder to one attachment.
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

/** Measured on 2026-09-24 by importing github.com/expressjs/express through
 * /how-to/github-repo-to-text at the defaults with Format set to Plain, and
 * read off the result screen: 213 files fetched, 206 combined, 196,127 tokens
 * (FileConcat's o200k estimate), download express_fileconcat.txt. The
 * repository moves, so a rerun will not match exactly; re-date if rerun. */
const EXAMPLE = { fetched: 213, combined: 206, tokens: 196_127 };
const exampleChats = Math.ceil(EXAMPLE.combined / CHAT_FILE_CAP);
const shareOf = (window: number) => Math.round((EXAMPLE.tokens / window) * 100);
const num = (n: number) => n.toLocaleString("en-US");

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="claude-upload-example">
      <div className="mx-auto max-w-[580px] text-center">
        <h2
          id="claude-upload-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          {num(EXAMPLE.combined)} files, one attachment.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
          We imported the Express repository on 2026-09-24. Its {num(EXAMPLE.combined)} files would
          fill {exampleChats} chats at {CHAT_FILE_CAP} each. As one file they took one slot, at{" "}
          {num(EXAMPLE.tokens)} tokens by our estimate: {shareOf(1_000_000)}% of a 1M-token window,
          and {shareOf(200_000)}% of a 200K one, where the length limit is the wall to watch.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="github.com/expressjs/express">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`${num(EXAMPLE.fetched)} files fetched\n`}
              {`${num(EXAMPLE.fetched - EXAMPLE.combined)} left out\n`}
              {`${exampleChats} chats at ${CHAT_FILE_CAP} files each`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="express_fileconcat.txt" trailing={<SlotChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a\ncodebase, assembled by fileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`Source: https://github.com/\nexpressjs/express\n`}</span>
              <span className="text-go-fg">{`File count: ${EXAMPLE.combined}.\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

function SlotChip() {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">1</span>
      <span className="text-ink-faint"> of {CHAT_FILE_CAP}</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="claude-upload-faq">
      <h2
        id="claude-upload-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CLAUDE_UPLOAD_LIMIT_FAQ.map((item) => (
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
    <MarketingSection labelledBy="claude-upload-cta" className="text-center">
      <h2
        id="claude-upload-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Send the whole folder as one attachment.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop a folder or paste a link
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        Working in a Claude project instead?{" "}
        <ProseLink to="/for/claude-projects">Fix Project knowledge exceeds maximum</ProseLink>.
        Every assistant&apos;s caps side by side:{" "}
        <ProseLink to="/how-to/share-all-files-with-ai">AI file upload limits</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
