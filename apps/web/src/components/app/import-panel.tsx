import { useMemo } from "react";
import { ArrowRight, Check, Info, X } from "lucide-react";
import { SOURCE_METADATA } from "@fileconcat/core";

import { cn } from "~/lib/utils";
import { classifyUrl, type Classification, type ImportTab } from "~/lib/classify-url";
import { SegmentedControl } from "./segmented-control";

type ImportPanelProps = {
  tab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
  url: string;
  onUrlChange: (url: string) => void;
  error: string | null;
  onFetch: () => void;
  isFetching: boolean;
  onClose: () => void;
};

const TABS: { value: ImportTab; label: string }[] = [
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
  { value: "bitbucket", label: "Bitbucket" },
  { value: "gist", label: "Gist" },
  { value: "url", label: "URL" },
];

/** Live caption under the input — what the link actually is, never a dead end. */
function caption(c: Classification): { text: string; tone: "go" | "info" } | null {
  switch (c.kind) {
    case "repo":
      return { text: `${c.hostName} repo. Press Fetch.`, tone: "go" };
    case "gist":
      return { text: "Gist. Press Fetch.", tone: "go" };
    case "page":
      return { text: "Web page. Readable text only.", tone: "go" };
    case "binary":
      return { text: `This link points to a ${c.fileType} file, not text.`, tone: "info" };
    case "bad":
      return { text: "Not a public link yet.", tone: "info" };
    case "empty":
      return null;
  }
}

/**
 * Progressive-disclosure import surface. Source tabs steer the placeholder and
 * examples; classification is URL-driven, so a link pasted under any tab still
 * resolves to what it really is. Fetch lights up green only when fetchable;
 * failures land as a friendly amber note, never a red error.
 */
export function ImportPanel({
  tab,
  onTabChange,
  url,
  onUrlChange,
  error,
  onFetch,
  isFetching,
  onClose,
}: ImportPanelProps) {
  const meta = SOURCE_METADATA[tab];
  const c = useMemo(() => classifyUrl(url, tab), [url, tab]);
  const cap = caption(c);
  const canFetch = c.kind === "repo" || c.kind === "gist" || c.kind === "page";

  return (
    <div
      role="region"
      aria-label="Import from a link"
      className="border-border bg-surface-alt rounded-panel animate-fade-up border p-4 text-left motion-reduce:animate-none sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-ink text-[15px] font-semibold tracking-[-0.01em]">
            Paste a link to fetch and combine
          </h2>
          <p className="text-ink-muted mt-0.5 text-[13px]">
            A public repo, a Gist, or a page. Nothing gets stored.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close import"
          className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-alt -mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <SegmentedControl
          ariaLabel="Import source"
          size="sm"
          value={tab}
          onChange={onTabChange}
          options={TABS}
        />
      </div>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canFetch && !isFetching) onFetch();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={meta.placeholder}
            aria-label={`${meta.name} link`}
            className="border-border bg-surface-inset text-ink placeholder:text-ink-faint focus-visible:border-border-strong focus-visible:ring-ring rounded-input min-w-0 flex-1 border px-3 py-2.5 font-mono text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            disabled={!canFetch || isFetching}
            className={cn(
              "rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-[filter,background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              canFetch && !isFetching
                ? "bg-primary text-primary-foreground hover:brightness-110"
                : "bg-surface-inset text-ink-faint border-border cursor-not-allowed border",
            )}
          >
            {isFetching ? "Fetching…" : "Fetch"}
          </button>
        </div>

        {cap && (
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 font-mono text-[12px]",
              cap.tone === "go" ? "text-go-fg" : "text-info",
            )}
          >
            {cap.tone === "go" ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {cap.text}
          </p>
        )}
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-ink-faint mr-0.5 font-mono text-[11px] uppercase tracking-[0.12em]">
          Try
        </span>
        {meta.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onUrlChange(example)}
            className="border-border bg-surface-inset text-ink-muted hover:text-ink hover:border-border-strong focus-visible:ring-ring focus-visible:ring-offset-surface-alt rounded-chip max-w-full truncate border px-2 py-1 font-mono text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {example.replace(/^https?:\/\//, "")}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-card mt-4 flex items-start gap-3 border border-[oklch(var(--info)/0.3)] bg-[oklch(var(--info)/0.07)] p-3">
          <Info className="text-info mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          <p className="text-ink-secondary text-[13px] leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}

/** The collapsed entry point that reveals the panel. */
export function ImportTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background group rounded-sm text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      Got a link instead? Import from a repo, Gist or URL{" "}
      <ArrowRight className="inline h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}
