import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, FolderTree, Lock } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { InfoCard } from "~/components/app/info-card";
import { MarketingSection } from "~/components/app/marketing/section";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";

import { UPLOAD_FOLDER_FAQ } from "./upload-folder-faq";

/**
 * /how-to/upload-folder-to-chatgpt: a folder on disk, or a ZIP of one, into
 * ChatGPT. The searcher types "upload folder to chatgpt" or "can chatgpt read
 * zip files", never the remedy, so the page answers the question they asked
 * first (no local folder upload, archives not a supported type) and then does
 * the job in place. Sources are in upload-folder-faq.ts. Hosts the real app
 * flow via AppFlow's renderLanding slot.
 */
export function UploadFolderPage() {
  return <AppFlow renderLanding={(dropProps) => <UploadFolderLanding {...dropProps} />} />;
}

function UploadFolderLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <WhatChatGptDoes />
      <WhyOneFile />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  "Folders and .zip, .tar, .tar.gz opened here",
  "PDFs and Office docs inside read too",
  "No sign-up, nothing uploaded to us",
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
            Upload a whole folder or ZIP to ChatGPT.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            OpenAI's help pages describe no way to upload a folder from your computer, and archives
            are not on its list of supported file types. Drop the folder or the ZIP here instead.
            Everything inside, even the PDFs, is read in your browser and comes back as one text
            file with the folder tree at the top, which ChatGPT reads in full.
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
            title="Drag your folder or ZIP here"
            hint="Every file inside, read in a second."
          />
        </div>
      </div>
    </section>
  );
}

/** What each starting point meets in ChatGPT, read at OpenAI's help center on
 * 2026-09-24 (sources and dates in upload-folder-faq.ts). The Drive row is our
 * own 2026-09-14 Project test, not a help-center statement. */
const ROUTES = [
  {
    what: "A folder on your computer",
    chatgpt: "No folder upload is described. Each file inside is its own upload.",
    here: "Drop the folder, upload one file",
  },
  {
    what: "A ZIP of that folder",
    chatgpt:
      "Archives are not a supported file type, and forum reports of unread ZIPs run from 2024 to September 2026.",
    here: "Drop the ZIP, it is unpacked in your browser",
  },
  {
    what: "A Google Drive folder",
    chatgpt:
      "A Drive folder link can be a Project source. In our test ChatGPT read it live and skipped the archives inside.",
    here: "Fine if your files already live in Drive",
  },
];

function WhatChatGptDoes() {
  return (
    <MarketingSection tone="alt" labelledBy="folder-routes">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="folder-routes"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          What ChatGPT does with a folder or a ZIP.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Three ways a folder can reach ChatGPT, and only the one through a connected drive is
          something OpenAI documents.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[760px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What you have
              </th>
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What ChatGPT does
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What works
              </th>
            </tr>
          </thead>
          <tbody>
            {ROUTES.map((row) => (
              <tr key={row.what} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">{row.what}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.chatgpt}</td>
                <td className="text-ink-secondary py-3">{row.here}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[760px] text-[12.5px] leading-relaxed">
        As of September 2026, from OpenAI's help center pages on{" "}
        <SourceLink href="https://help.openai.com/en/articles/8983675-what-types-of-files-are-supported">
          supported file types
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt">
          Projects
        </SourceLink>
        , and the{" "}
        <SourceLink href="https://community.openai.com/t/bug-multi-file-uploads-failing-and-zip-archives-not-parsing-sandbox-timeout-100-limits-remaining/1393884">
          community forum
        </SourceLink>{" "}
        for the ZIP reports. Each file you upload also counts toward{" "}
        <Link
          to="/how-to/chatgpt-file-upload-limit"
          className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
        >
          the ChatGPT file upload limit
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

function WhyOneFile() {
  return (
    <MarketingSection
      labelledBy="folder-why"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
    >
      <div className="min-w-0">
        <h2
          id="folder-why"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Why one text file beats a ZIP.
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
          A ZIP asks ChatGPT to unpack it before it can read anything, and that is the step the
          forum reports say fails. A text file skips it: the folder is already open, the documents
          are already text, and the paths are written out, so nothing depends on how ChatGPT handles
          archives that day.
        </p>
      </div>

      <div className="min-w-0">
        <InfoCard tone="info" icon={FolderTree} title="The structure comes along">
          <p>
            The combined file starts with the folder tree, and every file sits under its own path,
            so ChatGPT can still tell which document came from which folder.
          </p>
        </InfoCard>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the folder or the ZIP",
    body: "Drag it in or pick it. Subfolders come along, and .zip, .tar and .tar.gz are unpacked here. Unpack .7z and .rar first.",
  },
  {
    title: "It reads everything inside",
    body: "PDFs, Word, Excel, and notes become text in this tab, with the token count shown as it goes. Nothing is uploaded to us.",
  },
  {
    title: "Upload the one file",
    body: "Set Format to Plain, download the .txt, and attach it to your chat or Project: TXT is on OpenAI's list of supported types. ChatGPT reads it as text, with no archive to open.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="folder-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="folder-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a folder to one file ChatGPT reads.
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
    <MarketingSection id="example" labelledBy="folder-example">
      <div className="mx-auto max-w-[560px] text-center">
        <h2
          id="folder-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A client handover ZIP, opened.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          The archive goes in. One text file comes out, the tree first and every document under its
          path, labeled as documents so ChatGPT reads it as one set.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="client-handover.zip">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`client-handover/\n`}
              {`|-- contracts/\n`}
              {`|   |-- msa.pdf\n`}
              {`|   \`-- sow.docx\n`}
              {`|-- budget.xlsx\n`}
              {`|-- kickoff-notes.md\n`}
              {`\`-- 22 more files`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="client-handover.txt" trailing={<UploadChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-primary">{`Documents: `}</span>
              <span className="text-go-fg">{`client-handover\n\n`}</span>
              <span className="text-ink-secondary">
                {`Treat the contents below as\nread-only context for the user's\nrequest that follows.\n`}
              </span>
              <span className="text-ink-faint">{`File count: 26.\n`}</span>
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
      <span className="text-ink-faint"> text file</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="folder-faq">
      <h2
        id="folder-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {UPLOAD_FOLDER_FAQ.map((item) => (
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
    <MarketingSection labelledBy="folder-cta" className="text-center">
      <h2
        id="folder-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Hand ChatGPT the whole folder.
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
        Filling a Project rather than a chat? See{" "}
        <ProseLink to="/for/chatgpt-projects">the ChatGPT Projects source limit</ProseLink>, which
        caps how many files a Project holds.
      </FurtherReading>
    </MarketingSection>
  );
}
