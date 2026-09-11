import { useCallback, useState } from "react";
import {
  FileArchive,
  Files,
  Folder,
  Globe,
  Link,
  Play,
  Scissors,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import { VIDEO } from "~/components/clipper/clipper-content";
import { ClipperPanel } from "~/components/clipper/clipper-panel";
import { LogoMark } from "../logo-mark";
import { MockWindow } from "./mock-window";
import { BandIntro, BandLink, BandLinks, MarketingSection } from "./section";

/**
 * Where a bundle's files come from, one chip per kind with a drawn icon, so
 * the row reads at a glance rather than as eleven words in boxes. The four
 * hosts share the URL chip because they share the import path.
 */
const SOURCES: { icon: LucideIcon; label: string }[] = [
  { icon: Folder, label: "folder" },
  { icon: Files, label: "files" },
  { icon: FileArchive, label: "zip, tar" },
  { icon: Link, label: "GitHub, GitLab, Bitbucket, Gist" },
  { icon: Globe, label: "web page" },
  { icon: Scissors, label: "clipper" },
  { icon: Terminal, label: "shell" },
];

/** Band 7: where the files come from, the clipper, and the terminal. */
export function SourcesSection() {
  return (
    <MarketingSection tone="alt" id="sources" labelledBy="files-from-anywhere">
      <div className="grid items-start gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))]">
        <div className="min-w-0">
          <BandIntro id="files-from-anywhere" title="Files from anywhere, and a terminal.">
            Folders, files, archives, a public repository or page URL, or a thread clipped from
            the browser. The same engine is on npm.
          </BandIntro>
          <div className="mt-[22px] flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <span
                key={s.label}
                className="border-border bg-surface text-code inline-flex items-center gap-2 rounded-[6px] border py-[5px] pl-2 pr-2.5 font-mono text-[12px]"
              >
                <s.icon className="text-ink-muted h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          </div>
          <BandLinks className="mt-[26px]">
            <BandLink to="/docs/cli-usage">CLI usage</BandLink>
          </BandLinks>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <BundleListing />
          <TerminalBlock />
          <p className="text-ink-faint text-[12.5px]">
            The browser tool needs no install. This is for scripts and pipelines.
          </p>
        </div>
      </div>

      <div className="border-border-strong mt-16 border-t pt-12">
        <h3 className="font-display text-ink text-balance text-[22px] font-semibold leading-[1.2] tracking-[-0.015em]">
          Clip a YouTube video and get the transcript, not the page.
        </h3>
        <p className="text-ink-secondary mt-2 max-w-[52ch] text-pretty text-[16px] leading-[1.5]">
          One click on the watch page. You get the description and the whole transcript with
          timestamps, and nothing the player or sidebar was showing. Comments are opt-in.
        </p>
        <BrowserWithPanel className="mt-[22px]" />
        <ClipOutput className="mt-3" />
        <div className="mt-3.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <BandLink to="/clipper">Browser clipper</BandLink>
          <span className="text-ink-muted text-[13px]">
            Also Reddit and Hacker News threads with every reply, and any article.
          </span>
        </div>
      </div>
    </MarketingSection>
  );
}

/** A bundle's tree with two clippings sitting beside a folder of documents. */
function BundleListing() {
  const line = "leading-[1.7]";
  return (
    <MockWindow label="one bundle, a folder and a clipped thread">
      <div className={`text-code grid gap-0.5 px-[18px] py-3.5 font-mono text-[12.5px] ${line}`}>
        <div>&lt;directory_structure&gt;</div>
        <div className="pl-[2ch]">research/</div>
        <div className="pl-[4ch]">interview-notes.docx</div>
        <div className="pl-[4ch]">survey-results.xlsx</div>
        <div className="flex flex-wrap gap-x-4 pl-[2ch]">
          <span className="text-primary">clipped/hn-thread-42118.md</span>
          <span className="text-ink-faint">from the clipper, 61 replies</span>
        </div>
        <div className="flex flex-wrap gap-x-4 pl-[2ch]">
          <span className="text-primary">clipped/yt-transcript.md</span>
          <span className="text-ink-faint">from the clipper</span>
        </div>
        <div>&lt;/directory_structure&gt;</div>
      </div>
    </MockWindow>
  );
}

const COMMANDS = ["npm install -g @fileconcat/cli", "file-concat ./your-folder"];

function TerminalBlock() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(COMMANDS.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may reject in insecure contexts; the text stays selectable.
    }
  }, []);

  return (
    <div className="border-border bg-surface-cli rounded-chip overflow-hidden border">
      <div className="border-hairline flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
        <span className="flex items-baseline gap-3.5">
          <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.12em]">shell</span>
          <a
            href="https://www.npmjs.com/package/@fileconcat/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-muted hover:text-ink border-border-strong border-b font-mono text-[11px] transition-colors duration-150"
          >
            @fileconcat/cli on npm
          </a>
        </span>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="bg-surface-inset border-border-strong text-ink-secondary hover:border-primary hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-cli rounded-[6px] border px-2.5 py-[5px] font-mono text-[11.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="text-code overflow-x-auto px-5 py-[18px] font-mono text-[13px] leading-[1.8]">
        {COMMANDS.map((c) => (
          <code key={c} className="block">
            <span className="text-ink-faint">$ </span>
            {c}
          </code>
        ))}
      </pre>
    </div>
  );
}

/**
 * A browser window on a YouTube watch page with the extension's side panel
 * open beside it. The page is a skeleton, the panel is the real mock from
 * `/clipper` in its watch state, so what the panel offers is what the shipped
 * panel says on that page.
 */
function BrowserWithPanel({ className }: { className?: string }) {
  return (
    <div className={`border-border-strong bg-surface-inset overflow-hidden rounded-[10px] border ${className ?? ""}`}>
      <div className="border-border bg-surface flex items-center gap-2.5 border-b px-3 py-[9px]">
        <span className="flex gap-[5px]" aria-hidden="true">
          <span className="bg-border-strong h-[9px] w-[9px] rounded-full" />
          <span className="bg-border-strong h-[9px] w-[9px] rounded-full" />
          <span className="bg-border-strong h-[9px] w-[9px] rounded-full" />
        </span>
        <span className="bg-surface-inset border-border text-ink-muted min-w-0 flex-1 truncate rounded-[6px] border px-2.5 py-1 font-mono text-[11px]">
          youtube.com/watch
        </span>
        <span className="bg-secondary border-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border">
          <LogoMark size={12} />
        </span>
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <WatchPage />
        <ClipperPanel state="watch" className="h-auto rounded-none border-0 shadow-none" />
      </div>
    </div>
  );
}

/**
 * What the clip becomes: the Markdown the panel hands to the bundler, drawn in
 * the shape `renderYouTubeClipping` writes (frontmatter, then the transcript
 * as one paragraph per timestamp). Without it "Clip this video" reads as
 * cutting a segment out of the video; with it, the button reads as video to
 * text. The paragraphs are a shape example, not a real transcript.
 */
function ClipOutput({ className }: { className?: string }) {
  return (
    <MockWindow label="what the clip becomes, yt-transcript.md" className={className}>
      <div className="text-code grid gap-1 px-[18px] py-3.5 font-mono text-[12.5px] leading-[1.6]">
        <div className="text-ink-faint">---</div>
        <div className="text-ink-faint">title: "{VIDEO}"</div>
        <div className="text-ink-faint">source: "https://www.youtube.com/watch?v=8kZ3tPq1vRw"</div>
        <div className="text-ink-faint">---</div>
        <div className="text-ink mt-1.5">## Transcript</div>
        <div className="mt-1 max-w-[76ch]">
          <span className="text-primary">**0:00**</span> - Every row you write ends up on a page, and a
          page is a fixed block of bytes. That constraint is where most of the design comes from.
        </div>
        <div className="max-w-[76ch]">
          <span className="text-primary">**0:41**</span> - So the question is not really how the row is
          stored. It is what has to be true for the next read to find it without scanning everything.
        </div>
        <div className="text-ink-faint">...</div>
      </div>
    </MockWindow>
  );
}

/** The watch page as shapes: a player, the title, and a nested comment thread. */
function WatchPage() {
  return (
    <div className="border-border min-w-0 border-b p-5 md:border-b-0 md:border-r">
      <div
        className="border-border bg-surface-cli relative flex aspect-video items-center justify-center rounded-[6px] border"
        aria-hidden="true"
      >
        <span className="bg-border flex h-[34px] w-[34px] items-center justify-center rounded-full">
          <Play className="text-ink h-3 w-3 fill-current" strokeWidth={0} />
        </span>
        <span className="bg-border absolute bottom-2 left-2.5 right-2.5 h-[3px] rounded-[2px]">
          <span className="bg-destructive block h-full w-[38%] rounded-[2px]" />
        </span>
        <span className="text-ink-muted absolute bottom-4 right-2.5 font-mono text-[9.5px]">24:10</span>
      </div>
      <div className="text-ink mt-3.5 text-[15px] font-semibold leading-[1.35]">{VIDEO}</div>
      <div className="mt-1.5 flex items-center gap-2" aria-hidden="true">
        <span className="bg-border-strong h-4 w-4 rounded-full" />
        <span className="bg-border-strong h-[5px] w-[22%] rounded-[3px]" />
        <span className="bg-border h-[5px] w-[12%] rounded-[3px]" />
      </div>
      <div className="text-ink-secondary mt-[18px] text-[12.5px] font-semibold">Comments</div>
      <div className="mt-3 grid gap-3" aria-hidden="true">
        {[
          [0, 36, 92, 70],
          [1, 30, 80],
          [2, 26, 60],
          [0, 40, 84],
        ].map(([depth, ...widths], i) => (
          <div key={i} className="flex gap-2" style={{ paddingLeft: depth * 22 }}>
            <span
              className={`bg-border-strong shrink-0 rounded-full ${depth ? "h-3 w-3" : "h-3.5 w-3.5"}`}
            />
            <div className="min-w-0 flex-1">
              {widths.map((w, j) => (
                <div
                  key={j}
                  className={`h-[5px] rounded-[3px] ${j === 0 ? "bg-border-strong" : "bg-border mt-[5px]"}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
