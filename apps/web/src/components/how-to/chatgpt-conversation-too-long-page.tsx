import { ArrowRight, Check, History } from "lucide-react";

import { AppFlow } from "~/components/app/app-flow";
import type { DropZoneProps } from "~/components/app/drop-zone";
import { EntrySurface } from "~/components/app/entry-surface";
import type { ImportState } from "~/components/app/import-panel";
import { InfoCard } from "~/components/app/info-card";
import { FurtherReading, MockWindow, ProseLink } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";
import { STORE_URL } from "~/components/clipper/clipper-page";

import { CHATGPT_CONVERSATION_TOO_LONG_FAQ } from "./chatgpt-conversation-too-long-faq";

/**
 * /how-to/chatgpt-conversation-too-long: the searcher hit "You've reached the
 * maximum length for this conversation" and wants the new chat to know what
 * the old one said. The remedy is the Clipper (the extension), which reads the
 * whole conversation from chatgpt.com rather than the few messages the page
 * holds, so the primary action is "Add to Chrome", not the drop zone. The page
 * still hosts AppFlow, because Send in the panel reuses an open fileconcat.com
 * tab and the clip then lands here. ChatGPT's own route, moving the chat into
 * a Project, is stated with its limits rather than left out.
 */
export function ChatgptConversationTooLongPage() {
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
      <WhyItForgets />
      <Routes />
      <Workflow />
      <WorkedExample />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** Read at OpenAI's help center on 2026-09-30 and pinned in vendor-caps.json. */
const PROJECTS_HELP = "https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt";
const MAX_LENGTH_THREAD =
  "https://community.openai.com/t/youve-reached-the-maximum-length-for-this-conversation-but-you-can-keep-talking-by-starting-a-new-chat-but-how-do-you-actually-continue-a-complex-project/1392865";
const WONT_OPEN_THREAD =
  "https://community.openai.com/t/can-no-longer-even-read-conversations-that-say-this-conversation-is-too-long-please-start-a-new-one/1380959";

const TRUST = [
  "Every turn, not only the few on screen",
  "No Plus plan needed, and it works in Claude or Gemini",
  "Free, and nothing is uploaded to us",
];

const linkClass =
  "text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex rounded-sm text-[13px] underline decoration-[oklch(var(--border-strong))] underline-offset-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function StoreButton() {
  return (
    <a
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
            ChatGPT conversation too long? Carry all of it into a new chat.
          </h1>

          <p className="text-ink-secondary mt-5 max-w-[52ch] text-[16px] leading-relaxed">
            When ChatGPT says you have reached the maximum length for this conversation, the new
            chat starts empty. FileConcat Clipper, a free Chrome side panel, reads the whole
            conversation and hands it back as one file you attach to the new chat, with its token
            count.
          </p>

          <ul className="mt-6 space-y-2">
            {TRUST.map((t) => (
              <li key={t} className="text-ink-secondary flex items-center gap-2 text-[14px]">
                <Check className="text-primary h-4 w-4 shrink-0" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <StoreButton />
            <a href="#example" className={linkClass}>
              See a measured example
            </a>
          </div>
        </div>

        <div className="min-w-0">
          <EntrySurface {...dropProps} linkImport={linkImport} />
          <p className="text-ink-faint mt-3 text-center text-[12.5px] leading-relaxed">
            Keep this tab open and Send in the panel brings the conversation here.
          </p>
        </div>
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

function WhyItForgets() {
  return (
    <MarketingSection tone="alt" labelledBy="conversation-too-long-why">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h2
            id="conversation-too-long-why"
            className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            Why the new chat starts from nothing.
          </h2>
          <div className="mt-6">
            <InfoCard tone="info" icon={History} title="Clip it while it still opens">
              <p>
                People on OpenAI&apos;s forum report old conversations that stop opening with{" "}
                <SourceLink href={WONT_OPEN_THREAD}>
                  &quot;This conversation is too long, please start a new one.&quot;
                </SourceLink>{" "}
                We have not tested the Clipper on one in that state.
              </p>
            </InfoCard>
          </div>
        </div>

        <div className="text-ink-secondary min-w-0 space-y-4 text-[15px] leading-relaxed">
          <p>
            A ChatGPT conversation can only grow so long. At the limit it stops taking messages and
            shows this, as{" "}
            <SourceLink href={MAX_LENGTH_THREAD}>quoted on OpenAI&apos;s forum</SourceLink>:
          </p>
          <blockquote className="border-border-strong text-ink border-l-2 pl-4 font-mono text-[13.5px] leading-relaxed">
            You&apos;ve reached the maximum length for this conversation, but you can keep talking
            by starting a new chat.
          </blockquote>
          <p>
            The new chat does not start with the old one&apos;s messages. Copying them across by
            hand fails quietly, because the page holds only the few messages near where you are
            looking and swaps the rest in as you scroll. Select all and copy, and most of the
            conversation is not there to copy.
          </p>
        </div>
      </div>
    </MarketingSection>
  );
}

const ROUTES = [
  {
    route: "Move the chat into a Project",
    gets: "The project's instructions and files; on Plus and Pro, ChatGPT can reference the project's previous chats",
    stops: "Plus and Pro for the chat history; a chat made with a GPT cannot be moved",
  },
  {
    route: "Clip it into one file",
    gets: "Every turn, attached to the new chat as a .txt",
    stops: "The file counts toward the new chat's length; OpenAI caps a file at 2M tokens",
  },
];

function Routes() {
  return (
    <MarketingSection labelledBy="conversation-too-long-routes">
      <div className="mx-auto max-w-[640px] text-center">
        <h2
          id="conversation-too-long-routes"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Two ways to continue a conversation in a new chat.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[50ch] text-[15px] leading-relaxed">
          ChatGPT has its own route on paid plans. The file works on any plan, in any assistant,
          and stays on your disk.
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
                What the new chat gets
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
        As of September 2026, from OpenAI&apos;s help center on{" "}
        <SourceLink href={PROJECTS_HELP}>Projects in ChatGPT</SourceLink> and on{" "}
        <SourceLink href="https://help.openai.com/en/articles/8555545-file-uploads-faq">
          file uploads
        </SourceLink>
        . OpenAI does not publish how long a conversation may grow.
      </p>
    </MarketingSection>
  );
}

const STEPS = [
  {
    title: "Open the conversation",
    body: "On chatgpt.com, open the long conversation and the Clipper side panel. It offers Clip this conversation.",
  },
  {
    title: "Clip and send",
    body: "The panel asks ChatGPT for the whole conversation, so nothing depends on scrolling. Send hands it to a fileconcat.com tab with its token count. Nothing is uploaded to us.",
  },
  {
    title: "Start the new chat with it",
    body: "Set Format to Plain, download the .txt and attach it to a new chat with a line like: this is our previous conversation, continue from the last turn. OpenAI lists TXT among the types it takes.",
  },
];

function Workflow() {
  return (
    <MarketingSection tone="alt" labelledBy="conversation-too-long-workflow">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2
          id="conversation-too-long-workflow"
          className="font-display text-ink max-w-[18ch] text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          From a full conversation to a fresh chat.
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

/** Measured on 2026-09-14 on one 41-turn ChatGPT conversation (the Clipper's
 * build measurement, docs/clipper-chat-plan.md): after load the /c/ page held
 * 4 of its 82 message elements, and the clipping without reasoning held all 41
 * turns in 201,838 characters. The conversation is private, so the page shows
 * counts only. The "4 of 82" line is already public on /clipper. */
const EXAMPLE = { turns: 41, messages: 82, onPage: 4, chars: 201_838 };
const num = (n: number) => n.toLocaleString("en-US");

function WorkedExample() {
  return (
    <MarketingSection id="example" labelledBy="conversation-too-long-example">
      <div className="mx-auto max-w-[580px] text-center">
        <h2
          id="conversation-too-long-example"
          className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          {EXAMPLE.messages} messages, {EXAMPLE.onPage} on the page.
        </h2>
        <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
          We measured a {EXAMPLE.turns}-turn ChatGPT conversation on 2026-09-14. After it loaded,
          the page held {EXAMPLE.onPage} of its {EXAMPLE.messages} messages. The clipping held all{" "}
          {EXAMPLE.turns} turns, {num(EXAMPLE.chars)} characters, in one file.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <MockWindow label="chatgpt.com/c/...">
          <pre className="text-code overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              {`${EXAMPLE.messages} messages in the conversation\n`}
              {`${EXAMPLE.onPage} on the page after load\n`}
              {`the rest swapped in as you scroll`}
            </code>
          </pre>
        </MockWindow>

        <div className="text-ink-faint flex items-center justify-center">
          <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[11px] lg:hidden">becomes</span>
        </div>

        <MockWindow label="one .txt file" trailing={<TurnsChip />}>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
            <code>
              <span className="text-ink-secondary">{`**User**\n`}</span>
              <span className="text-ink-faint">{`...\n`}</span>
              <span className="text-ink-secondary">{`**ChatGPT**\n`}</span>
              <span className="text-ink-faint">{`...\n`}</span>
              <span className="text-go-fg">{`${num(EXAMPLE.chars)} characters`}</span>
            </code>
          </pre>
        </MockWindow>
      </div>
    </MarketingSection>
  );
}

function TurnsChip() {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-primary">{EXAMPLE.turns}</span>
      <span className="text-ink-faint"> of {EXAMPLE.turns} turns</span>
    </span>
  );
}

function Faq() {
  return (
    <MarketingSection tone="alt" labelledBy="conversation-too-long-faq">
      <h2
        id="conversation-too-long-faq"
        className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
      >
        Common questions.
      </h2>

      <dl className="mt-8 max-w-[720px] space-y-7">
        {CHATGPT_CONVERSATION_TOO_LONG_FAQ.map((item) => (
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
    <MarketingSection labelledBy="conversation-too-long-cta" className="text-center">
      <h2
        id="conversation-too-long-cta"
        className="font-display text-ink mx-auto max-w-[20ch] text-balance text-[clamp(1.7rem,4vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.025em]"
      >
        Clip the conversation before you start over.
      </h2>
      <div className="mt-8">
        <StoreButton />
      </div>
      <FurtherReading>
        What else the panel clips: <ProseLink to="/clipper">FileConcat Clipper</ProseLink>, and the{" "}
        <ProseLink to="/docs/clipper">reference</ProseLink>. Attaching files instead?{" "}
        <ProseLink to="/how-to/chatgpt-file-upload-limit">The ChatGPT file upload limit</ProseLink>.
      </FurtherReading>
    </MarketingSection>
  );
}
