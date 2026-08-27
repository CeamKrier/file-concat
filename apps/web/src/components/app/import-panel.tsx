import { useMemo, useRef } from "react";
import { Check, Info } from "lucide-react";
import { SOURCE_METADATA } from "@fileconcat/core";

import { cn } from "~/lib/utils";
import { track } from "~/lib/metrics";
import { classifyUrl, type Classification, type ImportTab } from "~/lib/classify-url";

export type ImportState = {
  tab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
  url: string;
  onUrlChange: (url: string) => void;
  error: string | null;
  onFetch: () => void;
  isFetching: boolean;
};

/** Select options, lowercase because they are machine values, not brand names. */
const HOSTS: { value: ImportTab; label: string }[] = [
  { value: "github", label: "github" },
  { value: "gitlab", label: "gitlab" },
  { value: "bitbucket", label: "bitbucket" },
  { value: "gist", label: "gist" },
  { value: "url", label: "url" },
];

/** Live caption under the input: what the link actually is, never a dead end. */
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
 * The link lane of the home entry surface, under the drop target and the `or`
 * rule. `entry-surface.tsx` owns the frame; this owns the field.
 *
 * It used to hide behind a "Got a link instead?" text link below the feature
 * row, and the counters said what that cost: `source_used` recorded 4 Visits
 * using a remote source in the 30 days to 2026-08-27, against 438 that dropped
 * files. Progressive disclosure is right for a rare escape hatch and wrong for
 * one of two ways in, so the extra click is gone rather than relocated.
 *
 * Home only, deliberately. The nine `/for` pages and the `/how-to` hub each
 * argue one audience into one workflow, and a repo field under a hero about a
 * folder of case files is clutter that page has to carry for nobody. Remote
 * sources get their own pages instead of a row bolted onto every other one.
 *
 * The host is a select rather than the five-tab strip it replaced, because the
 * choice is smaller than the strip implied: classification is host-driven (see
 * `classifyUrl`), so a full link resolves to what it really is under any
 * value here. All the select decides is where a bare `owner/repo` lands, plus
 * which placeholder and examples to show. Five tabs spent a full row, and an
 * overflowing one on a phone, advertising a decision that mostly does nothing.
 */
export function ImportPanel({
  tab,
  onTabChange,
  url,
  onUrlChange,
  error,
  onFetch,
  isFetching,
}: ImportState) {
  const meta = SOURCE_METADATA[tab];
  const c = useMemo(() => classifyUrl(url, tab), [url, tab]);
  const cap = caption(c);
  const canFetch = c.kind === "repo" || c.kind === "gist" || c.kind === "page";

  /**
   * A link we refuse, counted when the person gives up on it.
   *
   * Not at the press: `canFetch` disables Fetch for exactly these, so no press
   * exists, `runImport` never sees them, and they write no `source_used`
   * either - they are absent from the data entirely. Blur is the only moment
   * this flow offers that means "done with this one", and by then the caption
   * under the box has already said why it was refused.
   *
   * Deduped on the link so moving focus in and out of one paste writes one row,
   * which makes the unit an attempt rather than a blur. **The link itself never
   * leaves the browser**: it is a Set key here, and only the refusal kind is
   * ever recorded.
   */
  const counted = useRef(new Set<string>());
  const countRefusal = () => {
    if (c.kind !== "bad" && c.kind !== "binary") return;
    const key = url.trim();
    if (counted.current.has(key)) return;
    counted.current.add(key);
    track("import_failed", c.kind);
  };

  return (
    <div role="region" aria-label="Import from a link" className="text-left">
      <h2 className="font-display text-ink text-[13.5px] font-semibold tracking-[-0.01em]">
        Paste a public link
      </h2>

      <form
        className="mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canFetch && !isFetching) onFetch();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select
            value={tab}
            onChange={(e) => onTabChange(e.target.value as ImportTab)}
            aria-label="Host for a bare owner/repo"
            className="border-border-strong bg-secondary text-ink-secondary rounded-input focus-visible:ring-ring flex-none cursor-pointer border px-2 py-2.5 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
          >
            {HOSTS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onBlur={countRefusal}
            placeholder={meta.placeholder}
            aria-label={`${meta.name} link`}
            className="border-border bg-surface-inset text-ink placeholder:text-ink-faint focus-visible:border-border-strong focus-visible:ring-ring rounded-input min-w-0 flex-1 basis-[150px] border px-3 py-2.5 font-mono text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            disabled={!canFetch || isFetching}
            className={cn(
              "rounded-input focus-visible:ring-ring focus-visible:ring-offset-surface-alt inline-flex flex-1 items-center sm:flex-none justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-[filter,background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              canFetch && !isFetching
                ? "bg-primary text-primary-foreground hover:brightness-110"
                : "bg-surface-inset text-ink-faint border-border cursor-not-allowed border",
            )}
          >
            {isFetching ? "Fetching..." : "Fetch"}
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
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            ) : (
              <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            )}
            {cap.text}
          </p>
        )}
      </form>

      {/* Under the button that produced it, above the examples that are the way
          out of it. A failed fetch is about the link in the field, so it reads
          before the suggestions for a different one. */}
      {error && (
        <div className="rounded-card mt-2.5 flex items-start gap-2.5 border border-[oklch(var(--info)/0.42)] bg-[oklch(var(--info)/0.07)] p-3">
          <Info className="text-info mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
          <p className="text-ink-secondary text-[13px] leading-relaxed">{error}</p>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-ink-faint mr-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]">
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
    </div>
  );
}
