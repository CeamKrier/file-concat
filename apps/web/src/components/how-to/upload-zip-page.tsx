import { Link } from "@tanstack/react-router";
import { ArrowUp, Check, Lock } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import { DropZone, type DropZoneProps } from "~/components/app/drop-zone";
import { MarketingSection } from "~/components/app/marketing/section";
import { FurtherReading, ProseLink } from "~/components/app/marketing";

import { UPLOAD_ZIP_FAQ } from "./upload-zip-faq";

/**
 * /how-to/upload-zip-to-chatgpt: the searcher types "can I upload a zip file to
 * chatgpt" or "can chatgpt read zip files". The honest answer has two halves,
 * the upload works and the reading may not, so the page says both before it
 * offers the way through, then does the job in place. Sources and the sample
 * behind the file counts are in upload-zip-faq.ts. Hosts the real app flow via
 * AppFlow's renderLanding slot.
 */
export function UploadZipPage() {
  return <AppFlow renderLanding={(dropProps) => <UploadZipLanding {...dropProps} />} />;
}

function UploadZipLanding(dropProps: DropZoneProps) {
  return (
    <>
      <Hero dropProps={dropProps} />
      <WhatEachAiDoes />
      <FileCounts />
      <Workflow />
      <Faq />
      <ClosingCta />
    </>
  );
}

const TRUST = [
  ".zip, .7z, .rar, .tar and .tar.gz unpacked here",
  "PDFs and Office docs inside read too",
  "No sign-up, files not uploaded to us",
];

function Hero({ dropProps }: { dropProps: DropZoneProps }) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,400px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
            Runs in your browser. Files not uploaded to us.
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            You can upload a ZIP to ChatGPT. Reading it is the part that can fail.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            The upload goes through, then ChatGPT has to unpack the archive before it sees a single
            file inside. ZIP is not on OpenAI's list of supported file types, and OpenAI's support
            team says the unpacking may not work even when the upload looks fine. Drop the ZIP here
            instead: everything inside is read in your browser and comes back as one text file,
            with nothing left to unpack.
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
            title="Drop your ZIP here"
            hint="Unpacked and read in your browser."
          />
        </div>
      </div>
    </section>
  );
}

/** Read 2026-10-13 at each vendor's help center, plus OpenAI's staff reply on
 * its community forum; sources in upload-zip-faq.ts. */
const VENDORS = [
  {
    who: "ChatGPT",
    upload: "No",
    reads:
      "The upload goes through, but the files inside are read only if its file-analysis tools unpack it, and OpenAI support says that may fail.",
  },
  {
    who: "Claude",
    upload: "No",
    reads:
      "Anthropic lists PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB and JSON, and says nothing about archives.",
  },
  {
    who: "Gemini",
    upload: "Yes",
    reads: "Up to 10 files inside, up to 100 MB, no video or audio.",
  },
];

function WhatEachAiDoes() {
  return (
    <MarketingSection tone="alt" labelledBy="zip-vendors">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="zip-vendors"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Can ChatGPT, Claude and Gemini read a ZIP?
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Only Gemini documents ZIP support, and it caps what an archive may hold.
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
                Listed as supported
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What gets read
              </th>
            </tr>
          </thead>
          <tbody>
            {VENDORS.map((row) => (
              <tr key={row.who} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">{row.who}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.upload}</td>
                <td className="text-ink-secondary py-3">{row.reads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[760px] text-[12.5px] leading-relaxed">
        As of October 2026, from{" "}
        <SourceLink href="https://help.openai.com/en/articles/8983675-what-types-of-files-are-supported">
          OpenAI's supported file types
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://community.openai.com/t/zip-uploads-accepted-but-cannot-be-extracted-in-chatgpt-business/1381613">
          its support team's forum reply
        </SourceLink>
        ,{" "}
        <SourceLink href="https://support.claude.com/en/articles/8241126-upload-files-to-claude">
          Anthropic's upload guide
        </SourceLink>{" "}
        and{" "}
        <SourceLink href="https://support.google.com/gemini/answer/14903178">
          Google's Gemini file limits
        </SourceLink>
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

/** The file counts are the `found` stage of the 2026-09-11 repo funnel run, 60
 * public repositories (see upload-zip-faq.ts). Counted from the JSON, not
 * estimated: more than 10 files 60, more than 20 59, more than 80 51, median 183. */
const COUNTS = [
  { limit: "10 files in a ZIP", who: "Gemini", over: "60 of 60" },
  { limit: "20 files in a chat", who: "Claude", over: "59 of 60" },
  { limit: "80 files every 3 hours", who: "ChatGPT, unzipped by hand", over: "51 of 60" },
];

function FileCounts() {
  return (
    <MarketingSection labelledBy="zip-counts">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="zip-counts"
            className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            Unzipping it yourself runs into the file limits.
          </h2>
          <p className="text-ink-secondary mt-4 max-w-[48ch] text-[15px] leading-relaxed">
            OpenAI's suggested workaround is to extract the ZIP and upload the files one by one.
            We counted the files in 60 public code repositories, the kind of folder people zip for
            an AI, and the typical one held 183. Almost every one is over each vendor's file limit.
            One combined text file counts once everywhere.
          </p>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-border border-b">
                <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                  Limit
                </th>
                <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                  Over it
                </th>
                <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                  Set by
                </th>
              </tr>
            </thead>
            <tbody>
              {COUNTS.map((row) => (
                <tr key={row.limit} className="border-hairline border-b align-top">
                  <td className="text-ink py-3 pr-4">{row.limit}</td>
                  <td className="text-primary font-display py-3 pr-4 text-[16px] font-bold">
                    {row.over}
                  </td>
                  <td className="text-ink-secondary py-3">{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-faint mt-3 text-[12.5px] leading-relaxed">
            Files in a fresh clone of each repository, counted September 2026 for{" "}
            <Link
              to="/blog/$slug"
              params={{ slug: "how-many-tokens-is-a-codebase" }}
              className="hover:text-ink-secondary underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150"
            >
              our repository size study
            </Link>
            . A GitHub ZIP holds the same files.
          </p>
        </div>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the ZIP",
    body: "Drop it in or pick it. .zip, .7z, .rar, .tar and .tar.gz are unpacked in your browser, folders inside included.",
  },
  {
    title: "It reads everything inside",
    body: "PDFs, Word, Excel and code become text in your browser, each under its own path, with the token count shown as it goes.",
  },
  {
    title: "Upload the one file",
    body: "Set Format to Plain and download the .txt. TXT is on both OpenAI's and Anthropic's lists of supported types, and there is no archive left to open.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="zip-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="zip-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a ZIP to one file ChatGPT reads.
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

function Faq() {
  return (
    <MarketingSection labelledBy="zip-faq">
      <h2
        id="zip-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {UPLOAD_ZIP_FAQ.map((item) => (
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
    <MarketingSection tone="alt" labelledBy="zip-cta" className="text-center">
      <h2
        id="zip-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Hand ChatGPT what is inside the ZIP.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your ZIP
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        Not zipped yet? See <ProseLink to="/how-to/upload-folder-to-chatgpt">how to upload a folder to ChatGPT</ProseLink>.
        Each file still counts toward <ProseLink to="/how-to/chatgpt-file-upload-limit">the ChatGPT file upload limit</ProseLink>,
        and what each format inside keeps is on <ProseLink to="/docs/formats">the formats list</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
