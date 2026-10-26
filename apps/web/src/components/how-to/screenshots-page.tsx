import { ArrowUp, ScanText } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import type { DropZoneProps } from "~/components/app/drop-zone";
import { EntrySurface } from "~/components/app/entry-surface";
import type { ImportState } from "~/components/app/import-panel";
import { InfoCard } from "~/components/app/info-card";
import { FurtherReading, HeroFootnote, ProseLink } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";
import MEASURED from "~/data/screenshots-measured.json";

import { SCREENSHOTS_FAQ } from "./screenshots-faq";

/**
 * /how-to/send-many-screenshots-to-chatgpt: the image cap, which no page owned
 * (/convert/image-to-text owns the conversion itself). The fix is reading the
 * screenshots into text, so the page is candid about what that drops: layout,
 * charts, and some words on busy interfaces, measured on the same nine
 * screenshots as the token figures. Hosts the real app flow via AppFlow's
 * renderLanding slot.
 */
export function ScreenshotsPage() {
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
      <Measured />
      <WhatItLoses />
      <Workflow />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** Read at Anthropic's vision docs and OpenAI's uploads page on 2026-10-26 and
 * pinned in vendor-caps.json. Move the date only when they are checked again. */
const CAPS_CHECKED = "October 2026";
const CLAUDE_VISION_DOCS = "https://platform.claude.com/docs/en/build-with-claude/vision";
const OPENAI_UPLOADS_HELP =
  "https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt";

const num = (n: number) => n.toLocaleString("en-US");
const pct = (share: number) => `${Math.round(share * 100)}%`;
const sortedTokens = MEASURED.rows.map((r) => r.textTokens).sort((a, b) => a - b);
const medianTokens = sortedTokens[Math.floor(sortedTokens.length / 2)];
const { standard, highResolution } = MEASURED.claudeImageTokens;

function Hero({ dropProps, linkImport }: LandingProps) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
        <div className="min-w-0">
          <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
            <ScanText className="text-primary h-3 w-3" strokeWidth={2.5} />
            Read in your browser
          </span>

          <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Too many screenshots for ChatGPT or Claude? Send their text as one file.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[17px] leading-relaxed">
            Claude takes 20 images a message, and ChatGPT Free 3 uploads a day. Read here, a whole
            folder of screenshots is one file.
          </p>
        </div>

        <div className="min-w-0">
          <EntrySurface {...dropProps} linkImport={linkImport} />
          <HeroFootnote
            source="vendor docs"
            checked={CAPS_CHECKED}
            example="See what we measured"
          />
        </div>
      </div>
    </section>
  );
}

const CAPS = [
  { where: "Claude, a message", caps: "Images you attach", limit: "20 on claude.ai" },
  { where: "Claude, an image", caps: "Dimensions", limit: "8000 x 8000 pixels" },
  { where: "ChatGPT, every plan", caps: "Files you upload", limit: "80 every 3 hours" },
  { where: "ChatGPT, Free plan", caps: "Files you upload per day", limit: "3" },
  { where: "ChatGPT, an image", caps: "Size", limit: "20 MB" },
];

function Limits() {
  return (
    <MarketingSection tone="alt" labelledBy="screenshot-limits">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="screenshot-limits"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          How many screenshots can you send?
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          Twenty a message to Claude, and to ChatGPT whatever is left of the file quota. Both count
          each screenshot as one, however little it shows.
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
        Figures as of {CAPS_CHECKED}, from{" "}
        <SourceLink href={CLAUDE_VISION_DOCS}>Anthropic&apos;s vision docs</SourceLink> and{" "}
        <SourceLink href={OPENAI_UPLOADS_HELP}>OpenAI&apos;s uploads page</SourceLink>, which adds
        that OpenAI may lower its limits during peak hours.
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

function Measured() {
  return (
    <MarketingSection id="example" labelledBy="screenshot-measured">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="screenshot-measured"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          A screenshot&apos;s text is smaller than the picture.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
          We read {MEASURED.rows.length} screenshots of real pages. Their text came to{" "}
          {num(medianTokens)} tokens at the median. Anthropic counts the same picture at{" "}
          {num(standard)} to {num(highResolution)} tokens, by model.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[720px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Screenshot of
              </th>
              <th className="text-ink-muted py-2.5 pr-4 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                As text
              </th>
              <th className="text-ink-muted py-2.5 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Words on the page
              </th>
            </tr>
          </thead>
          <tbody>
            {MEASURED.rows.map((row) => (
              <tr key={row.url} className="border-hairline border-b align-top">
                <td className="text-ink min-w-0 py-3 pr-4 font-medium">{row.page}</td>
                <td className="text-ink py-3 pr-4 text-right font-mono tabular-nums">
                  {num(row.textTokens)}
                </td>
                <td className="text-ink-secondary py-3 text-right font-mono tabular-nums">
                  {pct(row.wordsMatched)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[720px] text-[12.5px] leading-relaxed">
        Measured {MEASURED.measured}: the top of each page at 1920 x 1080, read with the English
        reader FileConcat uses and counted with its token estimate. &quot;Words on the page&quot; is
        the share of words read back that appear in the page&apos;s own text. A picture&apos;s cost
        is Anthropic&apos;s formula for a 1920 x 1080 image, from its{" "}
        <SourceLink href={CLAUDE_VISION_DOCS}>vision docs</SourceLink>, not a count of ours.
        OpenAI&apos;s chat app publishes no image cost.
      </p>
    </MarketingSection>
  );
}

function WhatItLoses() {
  return (
    <MarketingSection tone="alt" labelledBy="screenshot-loses">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="screenshot-loses"
            className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            When to send the picture instead.
          </h2>
          <div className="mt-6">
            <InfoCard tone="info" icon={ScanText} title="Writing only">
              <p>
                Reading keeps the words in each screenshot, under its file name. Layout, colors and
                anything drawn are left behind.
              </p>
            </InfoCard>
          </div>
        </div>

        <div className="text-ink-secondary min-w-0 space-y-4 text-[15px] leading-relaxed">
          <p>
            Screenshots of text read well. On the article and docs pages above, almost every word
            read back was on the page. Busy interfaces read worse: on GitHub, Hacker News and MDN,
            about one word in five was a misreading of a menu, an icon or a badge.
          </p>
          <p>
            So send the text when the words are what you want answered: an error message, a long
            thread, notes, a page of a document. Send the image when the picture is the question,
            like a chart, a layout or a design, and combine the rest.
          </p>
        </div>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Drop the screenshots",
    body: "Drop the folder, or select them all at once. PNG, JPEG, WebP, GIF and TIFF are read.",
  },
  {
    title: "Press Read text",
    body: "Each screenshot is read in your browser, a few seconds each. The first time, the reader for your language downloads once. Your files are not uploaded to us.",
  },
  {
    title: "Send the one file",
    body: "Copy it into the chat, or set Format to Plain and attach the .txt. Every screenshot's text sits under its own file name.",
  },
];

function Workflow() {
  return (
    <MarketingSection labelledBy="screenshot-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="screenshot-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a folder of screenshots to one file.
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
    <MarketingSection tone="alt" labelledBy="screenshot-faq">
      <h2
        id="screenshot-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {SCREENSHOTS_FAQ.map((item) => (
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
    <MarketingSection labelledBy="screenshot-cta" className="text-center">
      <h2
        id="screenshot-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Send every screenshot as one file.
      </h2>
      <div className="mt-8">
        <button
          type="button"
          onClick={toTop}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Drop your screenshots
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <FurtherReading>
        One image at a time instead?{" "}
        <ProseLink to="/convert/image-to-text">Image to text</ProseLink>
        . Sending documents, not screenshots:{" "}
        <ProseLink to="/how-to/claude-file-upload-limit">the Claude upload limit</ProseLink> and{" "}
        <ProseLink to="/how-to/chatgpt-file-upload-limit">the ChatGPT upload limit</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
