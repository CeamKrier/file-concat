import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { DEFAULT_IGNORE_STRING, matchesAnyPattern } from "@fileconcat/core";
import type { FileStatus, UserConfig } from "@fileconcat/core";

import FileTree from "~/components/file-tree";
import {
  queryMatcher,
  shareLabel,
  typeFacets,
  type TreeOrder,
} from "~/components/file-tree/tree-data";
import { notePress, type TreePress } from "~/components/file-tree/interaction-tally";
import type { ManualOverride } from "~/hooks/use-filter-state";
import type { BundleWeight } from "~/lib/bundle-weight";
import { currentRun, track, type MetricEvent } from "~/lib/metrics";
import { cn } from "~/lib/utils";

import { SegmentedControl } from "./segmented-control";
import { shareText } from "./result-view";

const fmt = new Intl.NumberFormat("en-US");

/** Type chips shown before "more": the heaviest types carry nearly every drop. */
const FACETS_SHOWN = 10;
const TOAST_MS = 8000;

type FilesPaneProps = {
  fileStatuses: FileStatus[];
  /** Text length per file index. */
  chars: readonly number[];
  onToggleFile: (index: number) => void;
  onToggleMany: (indices: number[], shouldInclude: boolean) => void;
  overrides: Record<string, ManualOverride>;
  restoreOverrides: (overrides: Record<string, ManualOverride>) => void;
  config: UserConfig;
  setConfig: (updates: Partial<Omit<UserConfig, "version">>) => void;
  tokens: number;
  fit: BundleWeight["fit"];
  onClose: () => void;
};

/**
 * What goes in the bundle, beside the result rather than over it: at 1024 px and
 * up a column on the left while the token count and fit line stay live on the
 * right; below that a full-screen sheet whose bottom bar carries the same two
 * numbers. Every bulk action goes through `onToggleMany`, the path a tree click
 * takes, and leaves an Undo.
 */
export function FilesPane({
  fileStatuses,
  chars,
  onToggleFile,
  onToggleMany,
  overrides,
  restoreOverrides,
  config,
  setConfig,
  tokens,
  fit,
  onClose,
}: FilesPaneProps) {
  const [query, setQuery] = useState("");
  // Typing changes only what is shown, and on a big drop the rows are the slow
  // part, so they follow a keystroke behind instead of holding it.
  const shownQuery = useDeferredValue(query.trim());
  const [order, setOrder] = useState<TreeOrder>("size");
  const [allTypes, setAllTypes] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLElement>(null);
  const searched = useRef(false);

  // Focus moves into the pane when it opens and back to what opened it when it
  // closes, so a keyboard user is never dropped at the top of the page.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    pane.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      filterInput.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const total = useMemo(
    () =>
      fileStatuses.reduce(
        (acc, s) => (s.classification === "binary" ? acc : acc + (chars[s.index] ?? 0)),
        0,
      ),
    [fileStatuses, chars],
  );
  const included = useMemo(() => {
    let count = 0;
    let weight = 0;
    for (const s of fileStatuses) {
      if (!s.included) continue;
      count += 1;
      weight += chars[s.index] ?? 0;
    }
    return { count, weight };
  }, [fileStatuses, chars]);

  const facets = useMemo(() => typeFacets(fileStatuses, chars), [fileStatuses, chars]);

  const matched = useMemo(() => {
    const matches = queryMatcher(shownQuery, matchesAnyPattern);
    return matches ? fileStatuses.filter((s) => matches(s.path)) : fileStatuses;
  }, [fileStatuses, shownQuery]);

  const matchActions = useMemo(() => {
    if (!shownQuery) return null;
    const readable = matched.filter((s) => s.classification !== "binary");
    const inMatch = new Set(readable.map((s) => s.index));
    return {
      readable: readable.map((s) => s.index),
      takeOut: readable.filter((s) => s.included).map((s) => s.index),
      putIn: readable.filter((s) => !s.included).map((s) => s.index),
      others: fileStatuses
        .filter((s) => s.included && !inMatch.has(s.index))
        .map((s) => s.index),
    };
  }, [matched, fileStatuses, shownQuery]);

  /** One bulk change with the state before it kept for Undo. */
  const bulk = useCallback(
    (press: TreePress, text: string, change: () => void) => {
      const before = {
        overrides,
        includePatterns: config.includePatterns,
        ignorePatterns: config.ignorePatterns,
      };
      notePress(press);
      change();
      setToast({
        text,
        undo: () => {
          notePress("undo");
          restoreOverrides(before.overrides);
          setConfig({
            includePatterns: before.includePatterns,
            ignorePatterns: before.ignorePatterns,
          });
          setToast(null);
        },
      });
    },
    [overrides, config.includePatterns, config.ignorePatterns, restoreOverrides, setConfig],
  );

  const atDefaults =
    config.includePatterns === "" &&
    config.ignorePatterns === DEFAULT_IGNORE_STRING &&
    Object.keys(overrides).length === 0;

  const onPaneKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    if (e.target === filterInput.current && query) {
      e.preventDefault();
      setQuery("");
      return;
    }
    e.preventDefault();
    onClose();
  };

  const files = (n: number) => `${fmt.format(n)} ${n === 1 ? "file" : "files"}`;
  const shownFacets = allTypes ? facets : facets.slice(0, FACETS_SHOWN);

  return (
    <aside
      ref={pane}
      role="dialog"
      aria-labelledby="files-pane-title"
      tabIndex={-1}
      onKeyDown={onPaneKey}
      className="bg-background z-modal lg:z-dropdown fixed inset-0 flex flex-col focus:outline-none lg:inset-auto lg:bottom-0 lg:left-0 lg:top-[53px] lg:w-[420px] lg:border-r lg:border-[oklch(var(--hairline))]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[oklch(var(--hairline))] px-4 py-3">
        <h2
          id="files-pane-title"
          className="font-display text-ink text-lg font-semibold tracking-[-0.02em]"
        >
          Files
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close files"
          className="text-ink-muted hover:text-ink focus-visible:ring-ring rounded-sm p-1.5 transition-colors hover:bg-[oklch(var(--accent))] focus-visible:outline-none focus-visible:ring-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        <div className="relative">
          <Search
            aria-hidden
            className="text-ink-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          />
          <input
            ref={filterInput}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!searched.current && e.target.value.trim()) {
                searched.current = true;
                notePress("search");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                pane.current?.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
              }
            }}
            placeholder="Filter by name or folder"
            aria-label="Filter by name or folder"
            aria-keyshortcuts="/"
            spellCheck={false}
            autoComplete="off"
            className="border-border bg-surface text-ink focus-visible:ring-ring focus-visible:border-border-strong rounded-input h-10 w-full border pl-9 pr-9 text-sm placeholder:text-[oklch(var(--text-muted))] focus-visible:outline-none focus-visible:ring-1 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                filterInput.current?.focus();
              }}
              aria-label="Clear the filter"
              className="text-ink-muted hover:text-ink focus-visible:ring-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {matchActions &&
          (matched.length === 0 ? (
            <p className="text-ink-secondary mt-2.5 text-[13px]">
              No file matches &quot;{shownQuery}&quot;.
            </p>
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <PaneButton
                disabled={matchActions.takeOut.length === 0}
                onClick={() =>
                  bulk("match-out", `Took out ${files(matchActions.takeOut.length)}.`, () =>
                    onToggleMany(matchActions.takeOut, false),
                  )
                }
              >
                Take out {fmt.format(matchActions.takeOut.length)}
              </PaneButton>
              <PaneButton
                disabled={matchActions.putIn.length === 0 && matchActions.others.length === 0}
                onClick={() =>
                  bulk(
                    "match-keep",
                    `Kept only ${files(matchActions.readable.length)}.`,
                    () => {
                      onToggleMany(matchActions.others, false);
                      onToggleMany(matchActions.putIn, true);
                    },
                  )
                }
              >
                Keep only these {fmt.format(matchActions.readable.length)}
              </PaneButton>
            </div>
          ))}

        {facets.length > 1 && (
          <div className="mt-5">
            <p className="text-ink-muted mb-2 text-[12.5px]">By type</p>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              {shownFacets.map((facet) => {
                const state =
                  facet.included === 0
                    ? "out"
                    : facet.included === facet.count
                      ? "in"
                      : "partial";
                const label = facet.ext || "no extension";
                return (
                  <button
                    key={facet.ext}
                    type="button"
                    aria-pressed={state === "in" ? true : state === "out" ? false : "mixed"}
                    title={`${fmt.format(facet.included)} of ${files(facet.count)} in. Click to ${state === "out" ? "put them back" : "take them out"}.`}
                    onClick={() =>
                      state === "out"
                        ? bulk("type-chip", `Put back ${files(facet.count)} (${label}).`, () =>
                            onToggleMany(facet.indices, true),
                          )
                        : bulk("type-chip", `Took out ${files(facet.included)} (${label}).`, () =>
                            onToggleMany(facet.indices, false),
                          )
                    }
                    className={cn(
                      "rounded-chip focus-visible:ring-ring flex shrink-0 items-baseline gap-2 border px-2.5 py-1 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
                      state === "in" &&
                        "border-primary text-go-fg bg-[oklch(var(--primary)/0.12)]",
                      state === "partial" &&
                        "border-primary text-ink-secondary border-dashed bg-[oklch(var(--primary)/0.05)]",
                      state === "out" &&
                        "border-border bg-surface text-ink-muted hover:border-border-strong",
                    )}
                  >
                    <span className={cn("font-mono", state === "out" && "line-through")}>
                      {label}
                    </span>
                    <span className="tabular-nums">{fmt.format(facet.count)}</span>
                    <span className="tabular-nums opacity-80">
                      {shareLabel(facet.weight, total)}
                    </span>
                  </button>
                );
              })}
              {facets.length > FACETS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllTypes((v) => !v)}
                  className="rounded-chip text-ink-muted hover:text-ink focus-visible:ring-ring shrink-0 px-2 py-1 text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
                >
                  {allTypes ? "Fewer" : `${facets.length - FACETS_SHOWN} more`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mb-2 mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-ink-secondary text-[13px]" aria-live="polite">
            {fmt.format(included.count)} of {files(fileStatuses.length)} in,{" "}
            {shareLabel(included.weight, total)} of the readable text
          </p>
          <SegmentedControl
            ariaLabel="Order"
            size="sm"
            value={order}
            onChange={setOrder}
            options={[
              { value: "size", label: "Largest first" },
              { value: "name", label: "A-Z" },
            ]}
          />
        </div>

        <div className="border-border bg-surface rounded-card border p-1.5">
          {matched.length > 0 ? (
            <FileTree
              fileStatuses={matched}
              chars={chars}
              total={total}
              order={order}
              query={shownQuery}
              onToggleFile={onToggleFile}
              onToggleMultipleFiles={onToggleMany}
            />
          ) : (
            <p className="text-ink-muted px-2 py-3 text-[13px]">Nothing to show.</p>
          )}
        </div>
        <p className="text-ink-muted mt-2 text-[12px]">
          Click a row to put it in or out. Keys: / filters, arrows move, Space toggles.
        </p>

        <details className="group mt-6">
          <summary className="text-ink-secondary hover:text-ink focus-visible:ring-ring cursor-pointer rounded-sm text-[13px] focus-visible:outline-none focus-visible:ring-2">
            Patterns (include and ignore)
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <PatternField
              label="Ignore"
              hint="node_modules, lockfiles and binaries are skipped automatically."
              value={config.ignorePatterns}
              onChange={(v) => {
                recordOncePerRun("filter_edited", "ignore");
                setConfig({ ignorePatterns: v });
              }}
              rows={3}
              placeholder=".git, node_modules, dist, *.lock"
            />
            <PatternField
              label="Only include"
              hint="Empty means everything readable."
              value={config.includePatterns}
              onChange={(v) => {
                recordOncePerRun("filter_edited", "include");
                setConfig({ includePatterns: v });
              }}
              rows={2}
              placeholder="src/**/*, **/*.md"
            />
          </div>
        </details>

        <div className="mt-5">
          <PaneButton
            disabled={atDefaults}
            onClick={() =>
              bulk("reset", "Back to the defaults.", () => {
                restoreOverrides({});
                setConfig({ includePatterns: "", ignorePatterns: DEFAULT_IGNORE_STRING });
              })
            }
          >
            Reset to defaults
          </PaneButton>
        </div>
      </div>

      <div role="status" aria-live="polite">
        {toast && (
          <div className="bg-surface flex items-center justify-between gap-3 border-t border-[oklch(var(--hairline))] px-4 py-2.5">
            <span className="text-ink-secondary text-[13px]">{toast.text}</span>
            <button
              type="button"
              onClick={toast.undo}
              className="text-go-fg focus-visible:ring-ring rounded-sm px-1.5 py-0.5 text-[13px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2"
            >
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Below 1024 px the result is under this sheet, so the two numbers that say
          whether to keep trimming ride along at the bottom. */}
      <div className="bg-surface flex items-center gap-3 border-t border-[oklch(var(--hairline))] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <p className="text-ink-secondary min-w-0 flex-1 truncate text-[13px]">
          <span className="text-ink font-medium tabular-nums">{fmt.format(tokens)}</span> tokens
          {fit && (
            <>
              ,{" "}
              {fit.level === "over" ? `${fit.ratio.toFixed(1)}x` : shareText(fit.ratio)} of{" "}
              {fit.modelName}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring h-10 shrink-0 px-5 text-sm font-semibold hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Done
        </button>
      </div>
    </aside>
  );
}

function PaneButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border-border-strong rounded-chip text-ink hover:bg-accent focus-visible:ring-ring border px-3 py-1.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PatternField({
  label,
  hint,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-secondary text-[12.5px]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="border-border bg-surface-inset text-code focus-visible:ring-ring focus-visible:border-border-strong rounded-input w-full resize-none border px-3 py-2 font-mono text-xs leading-relaxed placeholder:text-[oklch(var(--text-muted))] focus-visible:outline-none focus-visible:ring-1"
      />
      <span className="text-ink-muted text-[11.5px]">{hint}</span>
    </label>
  );
}

/** Module scope: the pane unmounts on every close, and a Run outlives that. */
const recorded = new Map<string, number | null>();

/**
 * Records a deliberate edit once per Run per value.
 *
 * These are `onChange` handlers on text boxes and pickers, so a naive emit would
 * write a row per keystroke and the row count would measure typing speed rather
 * than what happened (ADR-0014). Keyed on the Run, so the next drop starts
 * counting again.
 */
export function recordOncePerRun(name: MetricEvent, value: string): void {
  const key = `${name}/${value}`;
  const run = currentRun();
  if (recorded.get(key) === run) return;
  recorded.set(key, run);
  track(name, value);
}
