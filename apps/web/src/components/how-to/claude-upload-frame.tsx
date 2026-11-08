import { ArrowDown, ArrowRight, ArrowUp, CircleAlert, CircleCheck, FileText } from "lucide-react";
import { useEffect, useRef } from "react";

import { MockWindow } from "~/components/app/marketing/mock-window";
import { MarketingSection } from "~/components/app/marketing/section";
import { recordExampleStep } from "~/lib/example-step";

/** Measured on 2026-11-08 by importing github.com/expressjs/express through
 * /how-to/github-repo-to-text at the defaults with Format set to Plain, and
 * read off the result screen: 209 files combined, 197,671 tokens (FileConcat's
 * o200k estimate). The repository moves, so a rerun will not match exactly. */
const RUN = { date: "2026-11-08", files: 209, tokens: 197_671 };

/** Real Express file names (github.com/expressjs/express, read 2026-11-08). */
const FILES = [
  "index.js", "package.json", "Readme.md", "History.md", "application.js",
  "express.js", "request.js", "response.js", "utils.js", "view.js",
  "Route.js", "Router.js", "app.all.js", "app.engine.js", "app.head.js",
  "app.js", "app.listen.js", "app.locals.js", "app.options.js", "app.param.js",
];

const PROMPT = "Find the bug in the router.";

const num = (n: number) => n.toLocaleString("en-US");
const shareOf = (window: number) => Math.round((RUN.tokens / window) * 100);

/**
 * The Express run as one frame (Q190): the same new chat twice, both visible
 * at once with nothing to click. Left, 209 files dropped in: the first 20 are
 * attached and a notice says the rest were dropped. Right, one FileConcat file
 * holding all 209, uploaded. The notice wording is ours: Claude's help center
 * states the 20-file cap but not the message shown past it.
 */
export function ClaudeUploadFrame({ cap }: { cap: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const dropped = RUN.files - cap;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(
      (entries) => {
        // The first callback reports any overlap, so the ratio is checked too.
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
          recordExampleStep("seen");
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <MarketingSection id="example" labelledBy="claude-upload-example">
      <div>
        <div className="mx-auto max-w-[640px] text-center">
          <h2
            id="claude-upload-example"
            className="font-display text-ink text-balance text-[clamp(1.6rem,3.4vw,2.1rem)] font-bold leading-[1.12] tracking-[-0.025em]"
          >
            Claude takes {cap} files per chat. FileConcat makes your whole repository one.
          </h2>
        </div>

        <div className="mx-auto mt-10 grid max-w-[920px] gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-5">
          <ChatPanel
            caption={`Express dropped in as ${num(RUN.files)} files`}
            trailing={<span className="text-info">limit reached</span>}
            notice={
              <Notice tone="warn">
                Only {cap} files fit in a chat. The first {cap} were attached, the other {dropped} were
                dropped.
              </Notice>
            }
          >
            <ul className="flex flex-wrap gap-1" aria-hidden="true">
              {FILES.slice(0, cap).map((name) => (
                <li
                  key={name}
                  className="border-border bg-surface-inset text-ink-secondary flex items-center gap-1 rounded-[6px] border px-1.5 py-[3px] font-mono text-[10.5px]"
                >
                  <FileText className="h-3 w-3 shrink-0" strokeWidth={2} />
                  {name}
                </li>
              ))}
            </ul>
          </ChatPanel>

          <div className="flex items-center justify-center gap-2 self-center md:flex-col">
            <span className="text-go-fg rounded-pill border border-[oklch(var(--primary)/0.35)] bg-[oklch(var(--primary)/0.1)] px-3 py-1.5 text-center text-[13px] font-semibold leading-tight md:max-w-[12ch]">
              FileConcat joins them
            </span>
            <ArrowDown className="text-primary h-5 w-5 md:hidden" strokeWidth={2.25} aria-hidden="true" />
            <ArrowRight className="text-primary hidden h-6 w-6 md:block" strokeWidth={2.25} aria-hidden="true" />
          </div>

          {/* `seen` watches this panel, not the whole band: stacked on a
              landscape phone the band is taller than two screens, so half
              of it is never in view at once. */}
          <div ref={ref} className="flex min-w-0 flex-col">
            <ChatPanel
              caption="Express as one FileConcat file"
              trailing={
                <span className="text-go-fg">{cap - 1} slots free</span>
              }
              notice={
                <Notice tone="ok">
                  Uploaded. All {num(RUN.files)} files are in this one attachment.
                </Notice>
              }
            >
              <div className="rounded-input border border-[oklch(var(--primary)/0.35)] bg-[oklch(var(--primary)/0.07)] px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileText className="text-primary h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink truncate font-mono text-[12.5px]">express_fileconcat.txt</div>
                    <div className="text-ink-muted font-mono text-[11px] tabular-nums">
                      {num(RUN.files)} files, {num(RUN.tokens)} tokens
                    </div>
                  </div>
                  <CircleCheck className="text-primary h-[18px] w-[18px] shrink-0" strokeWidth={2.25} aria-hidden="true" />
                </div>
                <pre
                  className="text-ink-muted border-hairline mt-2.5 overflow-hidden border-t pt-2 font-mono text-[11px] leading-[1.6]"
                  aria-hidden="true"
                >
                  {`express/\n  index.js\n  lib/application.js\n  lib/request.js\n  test/app.js`}
                  <span className="text-go-fg">{`\n  + every other file, ${num(RUN.files)} in all`}</span>
                </pre>
              </div>
            </ChatPanel>
          </div>
        </div>

        <p className="text-ink-muted mx-auto mt-8 max-w-[60ch] text-center text-[13.5px] leading-relaxed">
          One file still has to fit the length limit. Express is {num(RUN.tokens)} tokens by our
          estimate: {shareOf(1_000_000)}% of a 1M window, {shareOf(200_000)}% of a 200K one. Past your
          model's window, the result screen splits it into parts. Measured on
          github.com/expressjs/express, <span className="whitespace-nowrap">{RUN.date}</span>.
        </p>
      </div>
    </MarketingSection>
  );
}

/** A new chat: empty thread, then the notice, then the composer holding the
 * attachments and the typed prompt. Both panels share it so only the
 * attachments and the notice differ. */
function ChatPanel({
  caption,
  trailing,
  notice,
  children,
}: {
  caption: string;
  trailing: React.ReactNode;
  notice: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col">
      <MockWindow
        className="flex flex-1 flex-col"
        label="New chat with Claude"
        trailing={<span className="text-ink-muted font-mono text-[11px] tabular-nums">{trailing}</span>}
      >
        <div className="flex flex-1 flex-col gap-3 p-3">
          <div className="flex-1" />
          {notice}
          <div className="border-border-strong bg-surface-alt rounded-card border p-2.5">
            {children}
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="text-ink-secondary truncate text-[13px]">{PROMPT}</span>
              <span className="bg-ink text-surface flex h-7 w-7 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </MockWindow>
      <figcaption className="text-ink-secondary mt-3 text-center text-[14px]">{caption}</figcaption>
    </figure>
  );
}

function Notice({ tone, children }: { tone: "warn" | "ok"; children: React.ReactNode }) {
  const warn = tone === "warn";
  const Icon = warn ? CircleAlert : CircleCheck;
  return (
    <p
      className={`rounded-input flex items-start gap-2 border px-3 py-2 text-[12.5px] leading-snug ${
        warn
          ? "text-info border-[oklch(var(--info)/0.4)] bg-[oklch(var(--info)/0.08)]"
          : "text-go-fg border-[oklch(var(--primary)/0.35)] bg-[oklch(var(--primary)/0.07)]"
      }`}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
