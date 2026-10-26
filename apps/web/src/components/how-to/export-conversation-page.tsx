import { ArrowRight } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import type { DropZoneProps } from "~/components/app/drop-zone";
import { EntrySurface } from "~/components/app/entry-surface";
import type { ImportState } from "~/components/app/import-panel";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";
import { STORE_URL } from "~/components/clipper/clipper-page";
import { trackStoreClick } from "~/lib/metrics";

import { EXAMPLE } from "./chatgpt-conversation-too-long-faq";
import { EXPORT_CONVERSATION_FAQ } from "./export-conversation-faq";

/**
 * /how-to/export-chatgpt-conversation-to-markdown: one conversation out of
 * ChatGPT, Claude or Gemini as Markdown. /how-to/chatgpt-conversation-too-long
 * owns carrying a chat into a new one; this page owns getting it out at all,
 * so it sets the Clipper against the vendors' account exports and against
 * select-all. The primary action is "Add to Chrome"; AppFlow stays because
 * Send in the panel reuses an open fileconcat.com tab.
 */
export function ExportConversationPage() {
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
      <Routes />
      <WorkedExample />
      <Workflow />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** Read on 2026-10-26 and pinned in vendor-caps.json. */
const OPENAI_EXPORT_HELP =
  "https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data";
const CLAUDE_EXPORT_HELP = "https://support.claude.com/en/articles/9450526-export-your-claude-data";

const footLinkClass =
  "hover:text-ink-secondary focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm underline decoration-[oklch(var(--border-strong))] underline-offset-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function StoreButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={trackStoreClick}
      className={`${className} bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
    >
      Add the Clipper to Chrome
      <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
    </a>
  );
}

function Hero({ dropProps, linkImport }: LandingProps) {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-4 pb-4 pt-14 sm:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
        <div className="min-w-0">
          <h1 className="font-display text-ink text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
            Export a ChatGPT or Claude conversation to Markdown.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[17px] leading-relaxed">
            One chat, every turn, as Markdown. No account export, no email to wait for.
          </p>
        </div>

        <div className="min-w-0">
          <div className="border-border bg-surface rounded-card border p-6">
            <p className="font-display text-ink text-[16px] font-semibold">FileConcat Clipper</p>
            <p className="text-ink-secondary mt-2 text-[14px] leading-relaxed">
              A free Chrome side panel for ChatGPT, Claude and Gemini. It reads the whole
              conversation, not only what is on screen, and the chat is not uploaded to us.
            </p>
            <StoreButton className="mt-5 w-full" />
            <p className="text-ink-faint mt-3 text-center text-[12.5px] leading-relaxed">
              Needs Chrome on a computer.{" "}
              <a href="#example" className={`whitespace-nowrap ${footLinkClass}`}>
                See what it writes
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-[480px]">
        <h2 className="font-display text-ink text-balance text-center text-[17px] font-semibold">
          Sending several chats as one file? Keep this tab open.
        </h2>
        <div className="mt-4">
          <EntrySurface {...dropProps} linkImport={linkImport} />
        </div>
        <p className="text-ink-faint mt-3 text-center text-[12.5px] leading-relaxed">
          Send in the panel brings each conversation here, into one bundle.
        </p>
      </div>
    </section>
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

const ROUTES = [
  {
    route: "ChatGPT's export",
    gets: "Every chat in the account, in a ZIP, from Settings, Data controls",
    stops: "Arrives by email or text, up to 7 days later; the link lasts 24 hours; not on Business or Enterprise",
  },
  {
    route: "Claude's export",
    gets: "Your whole chat history, from Settings, Privacy",
    stops: "A link by email that lasts 24 hours; not from the phone apps",
  },
  {
    route: "Select all and copy",
    gets: "What the page holds at that moment",
    stops: "A long chat holds only a few messages at a time, so most of it is missing",
  },
  {
    route: "The Clipper",
    gets: "One conversation, every turn, as Markdown, right away",
    stops: "Chrome on a computer; one conversation per clip",
  },
];

function Routes() {
  return (
    <MarketingSection tone="alt" labelledBy="export-routes">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="export-routes"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          How to export a ChatGPT conversation, four ways.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          The assistants export the whole account at once, by email. Getting one conversation out
          as Markdown takes the page itself.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[720px] overflow-x-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border border-b">
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Route
              </th>
              <th className="text-ink-muted py-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                What you get
              </th>
              <th className="text-ink-muted py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                Where it stops
              </th>
            </tr>
          </thead>
          <tbody>
            {ROUTES.map((row) => (
              <tr key={row.route} className="border-hairline border-b align-top">
                <td className="text-ink py-3 pr-4 font-medium">{row.route}</td>
                <td className="text-ink-secondary py-3 pr-4">{row.gets}</td>
                <td className="text-ink-secondary py-3">{row.stops}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-faint mx-auto mt-4 max-w-[720px] text-[12.5px] leading-relaxed">
        As of October 2026, from{" "}
        <SourceLink href={OPENAI_EXPORT_HELP}>OpenAI&apos;s export help</SourceLink> and{" "}
        <SourceLink href={CLAUDE_EXPORT_HELP}>Claude&apos;s export help</SourceLink>. Neither says
        what format the chats come in.
      </p>
    </MarketingSection>
  );
}

const num = (n: number) => n.toLocaleString("en-US");

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="export-example">
      <div className="mx-auto max-w-[580px] text-center">
        <h2
          id="export-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          What the Markdown looks like.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
          On a {EXAMPLE.turns}-turn ChatGPT conversation we measured, the page held {EXAMPLE.onPage}{" "}
          of its {EXAMPLE.messages} messages. The clipping held all {EXAMPLE.turns} turns,{" "}
          {num(EXAMPLE.chars)} characters, with each turn marked by who said it.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-[560px]">
        <MockWindow label="conversation.md">
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-ink-faint">{`---\ntitle: "..."\nsource: "https://chatgpt.com/c/..."\ncreated: 2026-10-26\n---\n`}</span>
              <span className="text-go-fg">{`_${EXAMPLE.turns} turns - reasoning and tool activity left out_\n\n`}</span>
              <span className="text-ink-secondary">{`**User**\n\n`}</span>
              <span className="text-ink-faint">{`...\n\n---\n\n`}</span>
              <span className="text-ink-secondary">{`**ChatGPT**\n\n`}</span>
              <span className="text-ink-faint">{`...`}</span>
            </code>
          </pre>
        </MockWindow>
        <p className="text-ink-faint mt-3 text-center text-[12.5px] leading-relaxed">
          The shape of a clipping, with the conversation&apos;s own text left out. The header lines
          suit Obsidian and other notes apps.
        </p>
      </div>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Open the conversation",
    body: "On chatgpt.com, claude.ai or gemini.google.com, open the conversation and the Clipper side panel. It offers Clip this conversation.",
  },
  {
    title: "Clip it",
    body: "The panel asks the site for the whole conversation, so nothing depends on scrolling. Turn on Include reasoning and tool activity if you want the model's working too.",
  },
  {
    title: "Copy or send",
    body: "Copy puts the Markdown on your clipboard. Send brings it to fileconcat.com, where several chats become one file: set Format to Markdown and download the .md.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="export-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="export-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a conversation to a Markdown file.
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
    <MarketingSection labelledBy="export-faq">
      <h2
        id="export-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {EXPORT_CONVERSATION_FAQ.map((item) => (
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
  return (
    <MarketingSection tone="alt" labelledBy="export-cta" className="text-center">
      <h2
        id="export-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Get the whole conversation out as Markdown.
      </h2>
      <div className="mt-8">
        <StoreButton />
      </div>
      <FurtherReading>
        Out of room in the chat instead?{" "}
        <ProseLink to="/how-to/chatgpt-conversation-too-long">
          Carry a long conversation into a new chat
        </ProseLink>
        . Everything else the side panel clips:{" "}
        <ProseLink to="/clipper">FileConcat Clipper</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
