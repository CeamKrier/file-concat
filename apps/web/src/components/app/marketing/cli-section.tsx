import { useCallback, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

import { MarketingSection } from "./section";
import { LabeledPoints, type LabeledPoint } from "./labeled-points";

const INSTALL = "npm install -g @fileconcat/cli";

const POINTS: LabeledPoint[] = [
  {
    label: "Pipe",
    body: (
      <>
        Stdout is the bundle, stderr is progress. Pipe it straight into{" "}
        <code className="text-code font-mono text-[12.5px]">| llm</code> without parsing noise.
      </>
    ),
  },
  {
    label: "Parse",
    body: (
      <>
        Add <code className="text-code font-mono text-[12.5px]">--parse</code> and it pulls plain
        text out of PDFs, Word, Excel, and slides.
      </>
    ),
  },
  {
    label: "Json",
    body: (
      <>
        <code className="text-code font-mono text-[12.5px]">--json</code> prints a machine summary,
        so a wrapper script can read the token count and file list.
      </>
    ),
  },
];

/** Section D: the CLI, kept visibly separate from the browser tool. */
export function CliSection() {
  return (
    <MarketingSection
      tone="cli"
      labelledBy="cli-band"
      className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16"
    >
      <div className="min-w-0">
        <span className="rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--neutral-info)/0.3)] bg-[oklch(var(--neutral-info)/0.1)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(var(--neutral-info))]">
          <Terminal className="h-3.5 w-3.5" strokeWidth={2} />
          Separate tool · command line
        </span>

        <h2
          id="cli-band"
          className="font-display text-ink mt-5 text-balance text-[clamp(1.6rem,3.4vw,2rem)] font-bold leading-[1.12] tracking-[-0.025em]"
        >
          Rather work in the terminal?
        </h2>
        <p className="text-ink-secondary mt-4 max-w-[46ch] text-[15px] leading-relaxed">
          The browser tool needs no install. The CLI is a separate package for the same engine, for
          when the files already live in your shell.
        </p>

        <LabeledPoints items={POINTS} />

        <p className="text-ink-faint mt-8 text-[12.5px] leading-relaxed">
          This is the command-line tool, not needed for the browser app.
        </p>
      </div>

      <div className="min-w-0">
        <TerminalBlock />
      </div>
    </MarketingSection>
  );
}

function TerminalBlock() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may reject in insecure contexts; the text stays selectable.
    }
  }, []);

  return (
    <div className="border-border-strong bg-surface-cli rounded-card overflow-hidden border">
      <div className="border-hairline flex items-center gap-2 border-b px-4 py-2.5">
        <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
        <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
        <span className="bg-ink-faint/40 h-2 w-2 rounded-full" />
        <span className="text-ink-muted ml-2 font-mono text-[11.5px]">zsh</span>
      </div>

      <div className="px-4 py-4 font-mono text-[13px] leading-[1.7]">
        <div className="flex items-center justify-between gap-3">
          <code className="text-code min-w-0 truncate">
            <span className="text-ink-faint">$ </span>
            {INSTALL}
          </code>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Install command copied" : "Copy install command"}
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-cli inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {copied ? <Check className="text-primary h-4 w-4" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-2">
          <code className="text-code">
            <span className="text-ink-faint">$ </span>
            file-concat ./your-folder
          </code>
        </div>
        <div className="mt-1">
          <code className="text-ink-faint">→ wrote bundle to stdout · 412 tokens</code>
        </div>
      </div>
    </div>
  );
}
