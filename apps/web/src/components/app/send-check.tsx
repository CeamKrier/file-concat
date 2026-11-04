import { useState, type ReactNode } from "react";
import { Database, KeyRound, type LucideIcon } from "lucide-react";
import { findSensitive, maskFindings, type Finding } from "@fileconcat/core";

/**
 * The send check (K1): what the bundle held that the user may not mean an AI
 * to see, and what was done about it. Detection and masking happen in
 * `app-flow.tsx`, in the step every export reads; this only reports and toggles.
 *
 * Never renders a value or part of one, only kinds, counts, file names and line
 * numbers, and carries `data-clarity-mask` anyway: file names are on it, and
 * Clarity records everything else on the page.
 */

/** One key as the screen lists it. `id` is per unique value in a file (spec, SG2). */
export type CheckedKey = { id: string; label: string; file: string; line: number };

/** A kind that is listed, not masked by default, with its one toggle. */
export type ListedKind = {
  kind: string;
  /** Singular and plural, "database password" / "database passwords". */
  noun: [string, string];
  count: number;
  files: string[];
  masked: boolean;
  onToggle: () => void;
};

export type SendCheckProps = {
  keys: CheckedKey[];
  kept: ReadonlySet<string>;
  onKeep: (ids: string[]) => void;
  onRemove: (ids: string[]) => void;
  listed: ListedKind[];
  /** Files a reading pass has not reached yet. */
  pending: number;
  /** Files the detector threw on, by name. */
  failed: string[];
  className?: string;
};

/** Keep is a set of these, never a category flag: a key that lands later is masked. */
export function findingId(path: string, f: Finding): string {
  return `${path}\n${f.kind}\n${f.value}`;
}

/** 1-based line of each finding (sorted by start), in one pass up to the last one. */
export function linesOf(text: string, findings: Finding[]): number[] {
  const out: number[] = [];
  let line = 1;
  let at = 0;
  for (const f of findings) {
    for (; at < f.start; at++) {
      const c = text.charCodeAt(at);
      if (c === 10 || (c === 13 && text.charCodeAt(at + 1) !== 10)) line++;
    }
    out.push(line);
  }
  return out;
}

/** The key rule whose findings are listed, not masked by default (spec, Detection). */
export const CONN = "connection-string";

/** One file's check, cached while its text is the same string. `null` findings: the detector threw. */
export type CheckedFile = { text: string; findings: Finding[] | null; lines: number[] };

export function checkFile(text: string): CheckedFile {
  try {
    const findings = findSensitive(text);
    return { text, findings, lines: findings.length ? linesOf(text, findings) : [] };
  } catch {
    return { text, findings: null, lines: [] };
  }
}

/**
 * The check of every included entry, reusing `prev` for a path only while its
 * text is the same string: a reading pass, a guess or a re-decode replaces the
 * text of the same path, and that new text has to be checked (SG1). The
 * returned map holds only these entries, so nothing older piles up.
 */
export function checkEntries(
  entries: readonly { path: string; content: string }[],
  included: ReadonlySet<string>,
  prev: ReadonlyMap<string, CheckedFile>,
): Map<string, CheckedFile> {
  const next = new Map<string, CheckedFile>();
  for (const e of entries) {
    if (!included.has(e.path)) continue;
    const hit = prev.get(e.path);
    next.set(e.path, hit && hit.text === e.content ? hit : checkFile(e.content));
  }
  return next;
}

/**
 * The text that leaves for one entry. Keys are masked unless their id was
 * kept; a connection-string password only once its kind was masked. A file
 * the detector threw on goes out as it is, and the block names it.
 */
export function maskEntry(
  path: string,
  text: string,
  hit: CheckedFile | undefined,
  kept: ReadonlySet<string>,
  maskedKinds: ReadonlySet<string>,
): string {
  if (!hit?.findings?.length) return text;
  return maskFindings(text, hit.findings, (f) =>
    f.kind === CONN ? maskedKinds.has(CONN) : f.category === "key" && !kept.has(findingId(path, f)),
  );
}

/** What the block lists: keys once per unique value in a file, then the rest by kind. */
export function summarizeCheck(checked: ReadonlyMap<string, CheckedFile>) {
  const keys: CheckedKey[] = [];
  const conn = { count: 0, files: [] as string[] };
  const failed: string[] = [];
  for (const [path, hit] of checked) {
    const name = path.split("/").pop() ?? path;
    if (hit.findings === null) failed.push(name);
    const seen = new Set<string>();
    hit.findings?.forEach((f, i) => {
      const id = findingId(path, f);
      if (seen.has(id)) return;
      seen.add(id);
      if (f.kind === CONN) {
        conn.count++;
        if (!conn.files.includes(name)) conn.files.push(name);
      } else if (f.category === "key") {
        keys.push({ id, label: f.label, file: name, line: hit.lines[i] ?? 1 });
      }
    });
  }
  return { keys, conn, failed };
}

const COVERAGE = "Names and addresses are not checked.";

const CHIP_BASE =
  "rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface-alt shrink-0 self-start border px-2.5 py-1.5 text-[12.5px] transition-[color,background-color,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
// Three tiers, so the action the check recommends is the one that stands out:
// primary (mask what is still going out), secondary (undo or keep), quiet (look).
const CHIP = {
  primary: `${CHIP_BASE} bg-primary text-primary-foreground border-transparent font-semibold hover:brightness-110`,
  secondary: `${CHIP_BASE} border-border-strong text-ink-secondary hover:bg-accent hover:text-ink`,
  quiet: `${CHIP_BASE} text-ink-muted hover:bg-accent hover:text-ink border-transparent`,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a, b, c"; past three, the first two then "+N more" (spec copy). */
function names(items: string[]): string {
  if (items.length > 3) return `${items.slice(0, 2).join(", ")} +${items.length - 2} more`;
  return items.join(", ");
}

const unique = (items: string[]) => [...new Set(items)];

function statusLines(pending: number, failed: string[]): string[] {
  const lines: string[] = [];
  if (pending > 0) {
    lines.push(
      pending === 1
        ? "Still reading 1 file. It is checked when its text lands."
        : `Still reading ${pending} files. They are checked when their text lands.`,
    );
  }
  if (failed.length > 0) lines.push(`Could not check ${names(failed)}.`);
  return lines;
}

export function SendCheck({ keys, kept, onKeep, onRemove, listed, pending, failed, className }: SendCheckProps) {
  const found = listed.filter((l) => l.count > 0);
  const status = statusLines(pending, failed);

  if (keys.length === 0 && found.length === 0) {
    // No box: nothing to act on, and the line is the coverage statement itself.
    return (
      <div data-clarity-mask="True" className={className}>
        {status.length === 0 ? (
          <p className="text-ink-muted text-[13px] leading-[1.55]">
            No keys or passwords found. {COVERAGE}
          </p>
        ) : (
          <p className="text-ink-muted text-[13px] leading-[1.55]">
            {status.join(" ")} {COVERAGE}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-clarity-mask="True"
      className={`border-border rounded-card bg-surface-alt overflow-hidden border ${className ?? ""}`}
    >
      <h3 className="text-ink-secondary px-[18px] py-3 text-[13.5px]">Checked before you send</h3>
      {keys.length > 0 && <KeysRow keys={keys} kept={kept} onKeep={onKeep} onRemove={onRemove} />}
      {found.map((l) => (
        <CheckRow
          key={l.kind}
          icon={Database}
          title={
            l.masked
              ? `${plural(l.count, l.noun[0], l.noun[1])} masked`
              : `${plural(l.count, l.noun[0], l.noun[1])} in ${names(l.files)}`
          }
          action={{ label: l.masked ? "Show again" : "Mask", onClick: l.onToggle, primary: !l.masked }}
        />
      ))}
      <div className="text-ink-muted border-t border-[oklch(var(--hairline))] px-[18px] py-3 text-[13px] leading-[1.55]">
        {[...status, COVERAGE].join(" ")}
      </div>
    </div>
  );
}

function KeysRow({ keys, kept, onKeep, onRemove }: Pick<SendCheckProps, "keys" | "kept" | "onKeep" | "onRemove">) {
  const [open, setOpen] = useState(false);
  const removed = keys.filter((k) => !kept.has(k.id));
  const keptKeys = keys.filter((k) => kept.has(k.id));

  const title =
    removed.length > 0
      ? `${plural(removed.length, "key", "keys")} removed: ${names(unique(removed.map((k) => `${k.label} in ${k.file}`)))}`
      : `${plural(keptKeys.length, "key", "keys")} kept as written`;

  return (
    <CheckRow
      icon={KeyRound}
      title={title}
      body={removed.length > 0 && keptKeys.length > 0 ? `${plural(keptKeys.length, "key", "keys")} kept as written` : undefined}
      action={
        removed.length > 0
          ? { label: "Keep originals", onClick: () => onKeep(removed.map((k) => k.id)) }
          : { label: "Remove again", onClick: () => onRemove(keptKeys.map((k) => k.id)), primary: true }
      }
      more={{ open, onToggle: () => setOpen((o) => !o) }}
    >
      {open && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {keys.map((k) => {
            const isKept = kept.has(k.id);
            return (
              <li key={k.id} className="flex items-center justify-between gap-3">
                <span className="text-ink-muted min-w-0 text-[13px] leading-[1.55]">
                  {k.label}, {k.file} line {k.line}
                  {isKept && ", kept"}
                </span>
                <button
                  type="button"
                  className={CHIP.secondary}
                  onClick={() => (isKept ? onRemove([k.id]) : onKeep([k.id]))}
                >
                  {isKept ? "Remove again" : "Keep"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </CheckRow>
  );
}

function CheckRow({
  icon: Icon,
  title,
  body,
  action,
  more,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action: { label: string; onClick: () => void; primary?: boolean };
  more?: { open: boolean; onToggle: () => void };
  children?: ReactNode;
}) {
  return (
    <div className="border-t border-[oklch(var(--hairline))] px-[18px] py-3.5">
      {/* Same shape as the ledger rows below: the actions drop under the
          sentence on a narrow screen, indented to the text. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="text-ink-faint mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center">
            <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-ink text-sm leading-[1.5]">{title}</div>
            {body && <div className="text-ink-muted mt-[3px] text-[13px] leading-[1.55]">{body}</div>}
          </div>
        </div>
        <div className="ml-8 flex shrink-0 gap-2 sm:ml-0">
          <button type="button" onClick={action.onClick} className={action.primary ? CHIP.primary : CHIP.secondary}>
            {action.label}
          </button>
          {more && (
            <button type="button" onClick={more.onToggle} aria-expanded={more.open} className={CHIP.quiet}>
              {more.open ? "Hide" : "Show each"}
            </button>
          )}
        </div>
      </div>
      {children && <div className="sm:ml-[34px]">{children}</div>}
    </div>
  );
}
