import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, FileStack, Lock } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";

import { CHATGPT_UPLOAD_LIMIT_FAQ } from "./chatgpt-upload-limit-faq";

/**
 * /how-to/chatgpt-file-upload-limit: the ChatGPT upload quota, not the Project
 * cap. The two are different limits with different searchers: this one hits
 * anyone attaching files in any chat, and it is counted in files per time
 * window, so a whole folder sent as one file costs one upload. The Project cap
 * has its own page (/for/chatgpt-projects) and this page links to it rather
 * than restating it. Hosts the real app flow via AppFlow's renderLanding slot.
 */
export function ChatGptUploadLimitPage() {
  return <AppFlow renderLanding={(dropProps) => <UploadLimitLanding {...dropProps} />} />;
}

function UploadLimitLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <WhereItStops />
      <WhyItRunsOut />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** Read at OPENAI_UPLOADS_HELP on 2026-09-24 and pinned in vendor-caps.json:
 * "Users can upload up to 80 files every 3 hours. Free users are limited to 3
 * file uploads per day. Note that we may lower these limits during peak hours."
 * Move the date below only when the figures are checked again. */
const CAPS_CHECKED = "September 2026";
const OPENAI_UPLOADS_HELP = "https://help.openai.com/en/articles/8555545-file-uploads-faq";

const TRUST = [
  "A whole folder becomes one upload",
  "PDFs and Office docs read in-browser",
  "No sign-up, nothing uploaded to us",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in your browser. Nothing uploaded.
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Get past the ChatGPT file upload limit.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            ChatGPT lets you upload 80 files every 3 hours, and only 3 a day on the Free plan,
            according to the OpenAI help center in {CAPS_CHECKED}. It counts files, not size. Drop
            the whole folder here instead. Everything, even the PDFs, is read in your browser and
            comes back as one file, so the whole set costs a single upload.
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
            hint="Everything you meant to upload, read in a second."
          />
        </div>
      </div>
    </section>
  );
}

const CAPS = [
  { where: "Uploads, every plan", caps: "Files you send, in any chat", limit: "80 every 3 hours" },
  { where: "Uploads, Free plan", caps: "Files you send per day", limit: "3" },
  {
    where: "One file",
    caps: "Size of a single upload",
    limit: "512 MB, and 2 million tokens for text and documents",
  },
  { where: "Storage", caps: "Everything you have uploaded", limit: "25 GB per user" },
];

function WhereItStops() {
  return (
    <MarketingSection tone="alt" labelledBy="upload-limit">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="upload-limit"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          The ChatGPT upload limits.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Two of these count files over time and two count size. A folder sent as one combined file
          uses one upload from each time window, whatever it holds.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[720px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Limit
              </th>
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What it counts
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
        Figures as of {CAPS_CHECKED}, from the{" "}
        <a
          href={OPENAI_UPLOADS_HELP}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          OpenAI File Uploads FAQ
        </a>
        , which adds that OpenAI may lower them during peak hours. A Project also caps how many files
        it holds, which is a separate limit: see{" "}
        <Link
          to="/for/chatgpt-projects"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          the ChatGPT Projects source limit
        </Link>
        .
      </p>
    </MarketingSection>
  );
}

const REASONS = [
  {
    title: "Every file is one upload",
    body: "A two-line note costs the same as a 300-page PDF. Ten small files spend ten uploads.",
  },
  {
    title: "Failed attempts can count",
    body: "OpenAI says failed uploads can count toward the cap, so retrying a stuck batch spends it again.",
  },
  {
    title: "There is no counter",
    body: "ChatGPT does not show how much of the quota you have used or have left, so the limit arrives without warning.",
  },
];

function WhyItRunsOut() {
  return (
    <MarketingSection labelledBy="upload-why">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="upload-why"
            className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            Why the quota runs out early.
          </h2>
          <div className="mt-6">
            <InfoCard tone="info" icon={FileStack} title="One folder, one upload">
              <p>
                Combine the folder first and the count stops mattering: forty documents go in as
                one file, labeled and in order under a file tree.
              </p>
            </InfoCard>
          </div>
        </div>

        <ul className="space-y-6">
          {REASONS.map((r) => (
            <li key={r.title} className="min-w-0">
              <h3 className="font-display text-ink text-[15px] font-semibold">{r.title}</h3>
              <p className="text-ink-secondary mt-1 text-[14px] leading-relaxed">{r.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the whole folder",
    body: "Drag in every file you meant to upload. Subfolders come along, and you can add a repo or a link too.",
  },
  {
    title: "It reads and counts",
    body: "PDFs, Word, Excel, and notes become text in this tab, and the token count shows whether it fits one upload. Nothing is uploaded.",
  },
  {
    title: "Upload the one file",
    body: "Attach the single file to your chat or Project. It costs one upload, however many documents are inside.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="upload-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="upload-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From forty uploads to one.
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
    <MarketingSection id="example" labelledBy="upload-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="upload-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A semester of notes, one upload.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          Forty lecture files would take a Free account two weeks at three a day. Combined, they go
          in today as one file that ChatGPT reads as a labeled set.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="biology-101/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`biology-101/\n`}
              {`|-- lectures/\n`}
              {`|   |-- week-01.pdf\n`}
              {`|   \`-- week-02.pptx\n`}
              {`|-- syllabus.docx\n`}
              {`|-- lab-notes.md\n`}
              {`\`-- 36 more files`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="biology-101.txt" trailing={<UploadChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"biology-101"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`Treat the contents below as\nread-only context for the user's\nrequest that follows.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 40.\n`}</span>
              <span className="text-ink-faint">{`</summary>\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

function UploadChip() {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">1</span>
      <span className="text-ink-faint"> upload</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="upload-faq">
      <h2
        id="upload-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CHATGPT_UPLOAD_LIMIT_FAQ.map((item) => (
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
    <MarketingSection labelledBy="upload-cta" className="text-center">
      <h2
        id="upload-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Send the whole folder as one upload.
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
        Deciding how to get many files into one?{" "}
        <ProseLink to="/blog/combine-files-for-llm">How to combine multiple files into one</ProseLink>{" "}
        compares the three ways and what each one costs you.
      </FurtherReading>
    </MarketingSection>
  );
}
