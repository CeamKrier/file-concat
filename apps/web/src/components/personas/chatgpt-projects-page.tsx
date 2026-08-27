import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, FileStack, Lock } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { MockWindow } from "~/components/app/marketing";

import { CHATGPT_PROJECTS_FAQ } from "./chatgpt-projects-faq";

/**
 * /for/chatgpt-projects — the ChatGPT Projects platform page, the first spoke off
 * the /how-to/share-all-files-with-ai hub. Targets the "chatgpt project file
 * limit" query specifically, so it goes deeper on ChatGPT than the hub can: the
 * Project-files vs per-chat vs Custom-GPT distinction, and why one combined file
 * is the right shape for a Project. Bespoke, not a template row, so it earns its
 * own index entry rather than reading as a doorway page. Hosts the real app flow
 * via AppFlow's renderLanding slot. Grammar stays clean; the raw search query is
 * never mirrored verbatim.
 */
export function ChatGptProjectsPage() {
  return <AppFlow renderLanding={(dropProps) => <ChatGptProjectsLanding {...dropProps} />} />;
}

function ChatGptProjectsLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <WhereItStops />
      <Workflow />
      <WhyOneFile />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "One file fills one Project slot",
  "PDFs and Office docs read in-browser",
  "No sign-up, nothing uploaded",
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
            Get past the ChatGPT Projects source limit.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            A Project caps how many files you can add, and on the lower plans you can hit it fast.
            Drop the whole folder here instead. Everything, even the PDFs, is read right in your
            browser and comes back as one file, so all your documents take a single Project slot.
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

/** ChatGPT-only caps, deeper than the cross-platform hub table: the three places
 * ChatGPT counts files, so the reader sees which limit they actually hit. */
const CAPS = [
  {
    where: "Project files",
    caps: "Shared across every chat in the Project",
    limit: "5 free, 25 on Go and Plus, 40 on Pro and above",
  },
  {
    where: "Files in one chat",
    caps: "Attachments on a single message",
    limit: "About 10 at a time",
  },
  { where: "Custom GPT knowledge", caps: "Files a Custom GPT can reference", limit: "20" },
];

function WhereItStops() {
  return (
    <MarketingSection tone="alt" labelledBy="chatgpt-limit">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="chatgpt-limit"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Where ChatGPT stops you.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          ChatGPT counts files in three separate places, and each has its own cap. A single combined
          file stays under all of them, because it is one file no matter how many documents went
          into it.
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
        Figures as of August 2026, and OpenAI changes them often. Check the current cap in the{" "}
        <a
          href="https://help.openai.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          OpenAI help center
        </a>
        . On Claude, Gemini, or NotebookLM instead? See{" "}
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
    body: "Drag in every document you want the Project to know about. Subfolders come along, and you can add a repo or a link too.",
  },
  {
    title: "It reads everything here",
    body: "PDFs, Word, Excel, and notes are turned into text in this tab, with a file tree at the top. Nothing is uploaded.",
  },
  {
    title: "Add the one file to your Project",
    body: "Upload the single file to the Project, and every chat in it can read the whole set from one slot.",
  },
];

function Workflow() {
  return (
    <MarketingSection labelledBy="chatgpt-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="chatgpt-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a full folder to one Project file.
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

function WhyOneFile() {
  return (
    <MarketingSection
      tone="alt"
      labelledBy="chatgpt-why"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="chatgpt-why"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Why one file beats twenty in a Project.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          Adding documents one by one runs into the cap and scatters them, so the model sees a loose
          pile with no order. A single file keeps every document together, in order, under a file
          tree, and leaves the rest of your Project slots free for the work you add later.
        </p>
      </div>

      <div className="min-w-0">
        <InfoCard tone="info" icon={FileStack} title="One slot, the whole set">
          <p>
            Whether it is five documents or fifty, the combined file counts as one of your Project
            files. The Project reads it as a single labeled set, and every chat you open inside the
            Project can reference the whole thing.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="chatgpt-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="chatgpt-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Thirty documents, one Project file.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          A folder that would blow past the Project cap goes in. A single file comes out, labeled as
          documents so ChatGPT reads it as one set, not as source code.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="q3-handbook/">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`q3-handbook/\n`}
              {`|-- policies/\n`}
              {`|   |-- expenses.pdf\n`}
              {`|   \`-- travel.docx\n`}
              {`|-- onboarding.pdf\n`}
              {`|-- org-chart.xlsx\n`}
              {`\`-- 26 more files`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="q3-handbook.txt" trailing={<SlotChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`<documents `}</span>
              <span className="text-ink-secondary">{`project=`}</span>
              <span className="text-go-fg">{`"q3-handbook"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-faint">{`<summary>\n`}</span>
              <span className="text-ink-secondary">
                {`This is a packed snapshot of a set\nof documents, assembled by\nfileconcat.com.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 30.\n`}</span>
              <span className="text-ink-faint">{`</summary>\n`}</span>
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
      <span className="text-ink-faint"> of your Project slots</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="chatgpt-faq">
      <h2
        id="chatgpt-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CHATGPT_PROJECTS_FAQ.map((item) => (
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
    <MarketingSection labelledBy="chatgpt-cta" className="text-center">
      <h2
        id="chatgpt-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Fit the whole folder into one Project slot.
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
