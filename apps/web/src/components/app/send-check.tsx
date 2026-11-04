import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Landmark,
  Mail,
  MessageSquareText,
  Phone,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { findSensitive, isDocumentPath, maskFindings, type ExcludedSummary, type Finding } from "@fileconcat/core";

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
  /** Review comments the readers kept in the text (`comments-included` notes). */
  comments: { count: number; files: string[] };
  /** The committed "always hide" entries and how many places they masked. */
  hide: { entries: string[]; places: number; onCommit: (entries: string[]) => void };
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

/**
 * Every kind that is listed with a Mask toggle, in screen order. `value` is the
 * kind's name in the `send_check` counter (`found-conn`, `masked-email`). Hyphens, not underscores: `normalizeValue` strips anything outside `[a-z0-9._/+-]`.
 */
export const LISTED: { kind: string; value: string; noun: [string, string]; icon: LucideIcon }[] = [
  { kind: CONN, value: "conn", noun: ["database password", "database passwords"], icon: Database },
  { kind: "email", value: "email", noun: ["email", "emails"], icon: Mail },
  { kind: "iban", value: "iban", noun: ["IBAN", "IBANs"], icon: Landmark },
  { kind: "ssn", value: "ssn", noun: ["SSN", "SSNs"], icon: IdCard },
  { kind: "card", value: "card", noun: ["card number", "card numbers"], icon: CreditCard },
  { kind: "phone", value: "phone", noun: ["phone number", "phone numbers"], icon: Phone },
];
const ICON = new Map(LISTED.map((l) => [l.kind, l.icon]));

/** One file's check, cached while its text is the same string. `null` findings: the detector threw. */
export type CheckedFile = { text: string; findings: Finding[] | null; lines: number[] };

/** `identifiers` on document files only (`isDocumentPath`): in code an email is a package author. */
export function checkFile(text: string, identifiers = false): CheckedFile {
  try {
    const findings = findSensitive(text, { identifiers });
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
    next.set(e.path, hit && hit.text === e.content ? hit : checkFile(e.content, isDocumentPath(e.path)));
  }
  return next;
}

/**
 * The text that leaves for one entry. Keys are masked unless their id was
 * kept; a listed kind (connection-string passwords, identifiers) only once it
 * was masked; the user's hidden words always. A file the detector threw on
 * still gets its hidden words masked, and the block names it.
 */
export function maskEntry(
  path: string,
  text: string,
  hit: CheckedFile | undefined,
  kept: ReadonlySet<string>,
  maskedKinds: ReadonlySet<string>,
  words: Finding[] = [],
): string {
  const findings = hit?.findings?.length ? [...hit.findings, ...words] : words;
  if (findings.length === 0) return text;
  return maskFindings(text, findings, (f) =>
    f.category === "word"
      ? true
      : f.category === "key" && f.kind !== CONN
        ? !kept.has(findingId(path, f))
        : maskedKinds.has(f.kind),
  );
}

/**
 * The excluded summary with `rename` applied to every path in it, so a hidden
 * word in a file name does not reach the bundle's notes either.
 */
export function renameExcluded(excluded: ExcludedSummary, rename: (path: string) => string): ExcludedSummary {
  const all = (paths?: string[]) => paths?.map(rename);
  return {
    ...excluded,
    oversize: all(excluded.oversize),
    unextractable: all(excluded.unextractable),
    binary: all(excluded.binary),
    unsupported: excluded.unsupported?.map((u) => ({ ...u, paths: u.paths.map(rename) })),
    unreadable: all(excluded.unreadable),
    partial: excluded.partial?.map((p) => ({ ...p, path: rename(p.path) })),
    pending: all(excluded.pending),
  };
}

/** What the block lists: keys once per unique value in a file, then the rest by kind. */
export function summarizeCheck(checked: ReadonlyMap<string, CheckedFile>) {
  const keys: CheckedKey[] = [];
  const listed = new Map(LISTED.map((l) => [l.kind, { count: 0, files: [] as string[] }]));
  const failed: string[] = [];
  for (const [path, hit] of checked) {
    const name = path.split("/").pop() ?? path;
    if (hit.findings === null) failed.push(name);
    const seen = new Set<string>();
    hit.findings?.forEach((f, i) => {
      const id = findingId(path, f);
      if (seen.has(id)) return;
      seen.add(id);
      const row = listed.get(f.kind);
      if (row) {
        row.count++;
        if (!row.files.includes(name)) row.files.push(name);
      } else if (f.category === "key") {
        keys.push({ id, label: f.label, file: name, line: hit.lines[i] ?? 1 });
      }
    });
  }
  return { keys, listed, failed };
}

const COVERAGE = "Names and addresses are not checked.";

const CHIP_ICON = "h-3.5 w-3.5 shrink-0";
const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface-alt shrink-0 self-start border px-2.5 py-1.5 text-[12.5px] transition-[color,background-color,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
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

export function SendCheck({
  keys,
  kept,
  onKeep,
  onRemove,
  listed,
  comments,
  hide,
  pending,
  failed,
  className,
}: SendCheckProps) {
  const [hiding, setHiding] = useState(false);
  const found = listed.filter((l) => l.count > 0);
  const status = statusLines(pending, failed);
  const showHide = hiding || hide.entries.length > 0;
  const openHide = showHide ? null : (
    <>
      <HideButton onClick={() => setHiding(true)} />{" "}
    </>
  );

  if (keys.length === 0 && found.length === 0 && comments.count === 0 && !showHide) {
    // No box: nothing to act on, and the line is the coverage statement itself.
    return (
      <div data-clarity-mask="True" className={className}>
        <p className="text-ink-muted text-[13px] leading-[1.55]">
          <span>{status.length === 0 ? `No keys or passwords found. ${COVERAGE}` : `${status.join(" ")} ${COVERAGE}`}</span>{" "}
          {openHide}
          <WhatIsChecked />
        </p>
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
          icon={ICON.get(l.kind) ?? KeyRound}
          title={
            l.masked
              ? `${plural(l.count, l.noun[0], l.noun[1])} masked`
              : `${plural(l.count, l.noun[0], l.noun[1])} in ${names(l.files)}`
          }
          action={{
            label: l.masked ? "Show again" : "Mask",
            icon: l.masked ? Eye : EyeOff,
            onClick: l.onToggle,
            primary: !l.masked,
          }}
        />
      ))}
      {comments.count > 0 && (
        <CheckRow
          icon={MessageSquareText}
          title={`${plural(comments.count, "review comment", "review comments")}, in ${names(comments.files)}`}
        />
      )}
      {showHide && <HideRow {...hide} focus={hiding} />}
      <div className="text-ink-muted border-t border-[oklch(var(--hairline))] px-[18px] py-3 text-[13px] leading-[1.55]">
        <span>{[...status, COVERAGE].join(" ")}</span> {openHide}
        <WhatIsChecked />
      </div>
    </div>
  );
}

/** Entries as typed: comma- or line-separated, trimmed, each once. */
export function parseHide(draft: string): string[] {
  return [
    ...new Set(
      draft
        .split(/[,\r\n]+/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];
}

function HideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-secondary hover:text-ink whitespace-nowrap underline underline-offset-4"
    >
      Hide names
    </button>
  );
}

/**
 * The "always hide" field. The words live only in the textarea's value and in
 * memory: never in an attribute, which Clarity records verbatim (AC-S8), and
 * never stored. Committed on Enter or blur, not per keystroke.
 */
function HideRow({ entries, places, onCommit, focus }: SendCheckProps["hide"] & { focus: boolean }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(() => entries.join(", "));
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const commit = () => onCommit(parseHide(draft));
  const note =
    entries.length === 0
      ? "Each one is replaced with [Hidden] in every file and file name, code included. Forgotten when you start over."
      : places > 0
        ? `Hidden in ${plural(places, "place", "places")}. Forgotten when you start over.`
        : "Not found in this bundle.";
  return (
    <div className="border-t border-[oklch(var(--hairline))] px-[18px] py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="text-ink-faint mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center">
          <EyeOff className="h-[15px] w-[15px]" strokeWidth={1.9} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-ink block text-sm leading-[1.5]">
            Always hide these words
          </label>
          <textarea
            id={id}
            ref={ref}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Names, a client, a project, separated by commas"
            spellCheck={false}
            autoComplete="off"
            className="border-border bg-surface-inset text-ink placeholder:text-ink-muted focus-visible:border-border-strong focus-visible:ring-ring rounded-input mt-2 block w-full resize-y border px-3 py-2 text-[13.5px] leading-[1.55] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
          />
          <p className="text-ink-muted mt-1.5 text-[13px] leading-[1.55]">{note}</p>
        </div>
      </div>
    </div>
  );
}

/** A new tab, so reading the list does not throw the bundle away. */
function WhatIsChecked() {
  return (
    <a
      href="/docs/send-check"
      target="_blank"
      rel="noopener"
      className="text-ink-secondary hover:text-ink whitespace-nowrap underline underline-offset-4"
    >
      What is checked
    </a>
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
          ? { label: "Keep originals", icon: Undo2, onClick: () => onKeep(removed.map((k) => k.id)) }
          : { label: "Remove again", icon: EyeOff, onClick: () => onRemove(keptKeys.map((k) => k.id)), primary: true }
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
                  {isKept ? (
                    <EyeOff className={CHIP_ICON} strokeWidth={2} aria-hidden />
                  ) : (
                    <Undo2 className={CHIP_ICON} strokeWidth={2} aria-hidden />
                  )}
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
  action?: { label: string; icon: LucideIcon; onClick: () => void; primary?: boolean };
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
        {action && (
          <div className="ml-8 flex shrink-0 gap-2 sm:ml-0">
            <button type="button" onClick={action.onClick} className={action.primary ? CHIP.primary : CHIP.secondary}>
              <action.icon className={CHIP_ICON} strokeWidth={2} aria-hidden />
              {action.label}
            </button>
            {more && (
              <button type="button" onClick={more.onToggle} aria-expanded={more.open} className={CHIP.quiet}>
                <ChevronDown
                  className={`${CHIP_ICON} transition-transform duration-200 motion-reduce:transition-none ${more.open ? "rotate-180" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
                {more.open ? "Hide" : "Show each"}
              </button>
            )}
          </div>
        )}
      </div>
      {children && <div className="sm:ml-[34px]">{children}</div>}
    </div>
  );
}
