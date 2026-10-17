import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Check,
  X,
  Minus,
  Lock,
} from "lucide-react";

import { formatSize } from "@fileconcat/core";
import { cn } from "~/lib/utils";

import {
  calculateInclusionState,
  shareLabel,
  type InclusionState,
  type TreeNode,
} from "./tree-data";
import { notePress } from "./interaction-tally";

export interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  /** Readable text in the whole drop: the denominator of every row's share. */
  total: number;
  /** Plain filter text to mark in names; a glob marks nothing. */
  mark: string;
  onToggleExpanded: (path: string) => void;
  onToggleFile: (index: number) => void;
  onToggleDirectory: (node: TreeNode) => void;
}

// Warm-dark toggle affordance: green check = in, muted x = left out, amber
// minus = partially in. Matches the drawer's go / info / dimmed semantics.
const ICON_BY_STATE: Record<InclusionState, JSX.Element> = {
  included: <Check className="text-primary h-3 w-3" />,
  excluded: <X className="text-ink-faint h-3 w-3" />,
  partial: <Minus className="text-info h-3 w-3" />,
};

/** Past this depth the indent stops growing, so a phone keeps room for the name. */
const MAX_INDENT_DEPTH = 4;

export function TreeNodeRow(props: TreeNodeRowProps): JSX.Element {
  const { node, depth, expandedPaths, total, mark, onToggleExpanded, onToggleFile, onToggleDirectory } =
    props;

  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = !!node.children && node.children.length > 0;
  const inclusionState = calculateInclusionState(node);
  const dimmed = inclusionState === "excluded";
  // A binary file has no recoverable text, so it is locked out of curation
  // (ADR-0009): its inclusion toggle is disabled.
  const isBinary = node.type === "file" && node.status?.classification === "binary";
  const bytes = node.type === "file" ? (node.status?.size ?? 0) : undefined;

  const handleInclusionToggle = (): void => {
    if (isBinary) return;
    if (node.type === "file" && node.status && typeof node.status.index === "number") {
      onToggleFile(node.status.index);
    } else {
      onToggleDirectory(node);
    }
  };

  // Up and down live on the tree itself; these are the keys that act on one row
  // (WAI-ARIA tree pattern).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === " ") {
      e.preventDefault();
      if (isBinary) return;
      notePress("key");
      handleInclusionToggle();
    } else if (e.key === "Enter" && hasChildren) {
      e.preventDefault();
      onToggleExpanded(node.path);
    } else if (e.key === "ArrowRight" && hasChildren) {
      e.preventDefault();
      if (!isExpanded) onToggleExpanded(node.path);
      else focusSibling(e.currentTarget, 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (hasChildren && isExpanded) onToggleExpanded(node.path);
      else focusParent(e.currentTarget);
    }
  };

  // One rule for the whole tree: clicking a row puts that node in or out,
  // folder or file. Opening and closing is the chevron's job, so the same
  // gesture never means two things. The chevron carries the folder glyph with
  // it, because `Folder` / `FolderOpen` is already a disclosure indicator.
  const glyphs = (
    <>
      <span className="flex h-4 w-4 items-center justify-center">
        {hasChildren &&
          (isExpanded ? (
            <ChevronDown className="text-ink-muted h-3 w-3" />
          ) : (
            <ChevronRight className="text-ink-muted h-3 w-3" />
          ))}
      </span>
      <span className="flex h-4 w-4 items-center justify-center">
        {node.type === "directory" ? (
          isExpanded ? (
            <FolderOpen className="text-ink-muted h-4 w-4" />
          ) : (
            <Folder className="text-ink-muted h-4 w-4" />
          )
        ) : (
          <File className="text-ink-faint h-4 w-4" />
        )}
      </span>
    </>
  );

  // Out of the tab order: the row is the keyboard stop, and a tab stop per
  // control would put two per file between the filter and the rest of the page.
  const disclosure = hasChildren ? (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      title={isExpanded ? "Collapse folder" : "Expand folder"}
      onClick={(e) => {
        e.stopPropagation();
        notePress("arrow");
        onToggleExpanded(node.path);
      }}
      className="flex shrink-0 items-center gap-1 rounded-sm py-1 hover:bg-[oklch(var(--accent))]"
    >
      {glyphs}
    </button>
  ) : (
    <span className="flex shrink-0 items-center gap-1 py-1">{glyphs}</span>
  );

  const inclusionControl = isBinary ? (
    <span
      title="Not text, nothing to include"
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"
    >
      <Lock className="text-ink-faint h-3.5 w-3.5" />
    </span>
  ) : (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      title={inclusionState === "included" ? "Leave out of the bundle" : "Put in the bundle"}
      onClick={(e) => {
        e.stopPropagation();
        notePress(node.type === "directory" ? "box-folder" : "box-file");
        handleInclusionToggle();
      }}
      className="border-border hover:border-border-strong flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors"
    >
      {ICON_BY_STATE[inclusionState]}
    </button>
  );

  return (
    <div role="none">
      <div
        role="treeitem"
        tabIndex={-1}
        aria-level={depth + 1}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-checked={inclusionState === "partial" ? "mixed" : inclusionState === "included"}
        aria-disabled={isBinary || undefined}
        aria-label={
          isBinary
            ? `${node.name}, not text, nothing to include`
            : `${node.name}, ${shareLabel(node.weight, total)} of the text`
        }
        title={bytes === undefined ? node.path : `${node.path}, ${formatSize(bytes)}`}
        onKeyDown={onKeyDown}
        className={cn(
          "focus-visible:ring-ring flex min-h-[30px] items-center gap-2 rounded-sm px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
          isBinary ? "cursor-default" : "cursor-pointer hover:bg-[oklch(var(--surface-inset))]",
        )}
        style={{ paddingLeft: `${Math.min(depth, MAX_INDENT_DEPTH) * 14 + 8}px` }}
        onClick={
          isBinary
            ? undefined
            : () => {
                notePress(node.type === "directory" ? "row-folder" : "row-file");
                handleInclusionToggle();
              }
        }
      >
        {disclosure}

        {inclusionControl}

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            node.type === "file"
              ? cn("font-mono", dimmed ? "text-ink-faint" : "text-ink-secondary")
              : cn("font-medium", dimmed ? "text-ink-muted" : "text-ink"),
          )}
        >
          {/* Below the indent cap a row carries the folders the indent no longer shows. */}
          <Marked
            text={
              depth > MAX_INDENT_DEPTH
                ? node.path.split("/").slice(MAX_INDENT_DEPTH).join("/")
                : node.name
            }
            mark={mark}
          />
        </span>

        {!isBinary && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] tabular-nums",
              dimmed ? "text-ink-faint" : "text-ink-muted",
            )}
          >
            {shareLabel(node.weight, total)}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div role="group">
          {node.children!.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              total={total}
              mark={mark}
              onToggleExpanded={onToggleExpanded}
              onToggleFile={onToggleFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The filter text marked inside a name, split by position, never by a RegExp built from input. */
function Marked({ text, mark }: { text: string; mark: string }): JSX.Element {
  const at = mark ? text.toLowerCase().indexOf(mark.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="text-ink rounded-[2px] bg-[oklch(var(--primary)/0.22)]">
        {text.slice(at, at + mark.length)}
      </mark>
      {text.slice(at + mark.length)}
    </>
  );
}

function rowsOf(from: HTMLElement): HTMLElement[] {
  const tree = from.closest('[role="tree"]');
  return tree ? [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')] : [];
}

/** Moves focus `step` rows up or down the visible tree. */
export function focusSibling(from: HTMLElement, step: number): void {
  const rows = rowsOf(from);
  const at = rows.indexOf(from);
  rows[Math.max(0, Math.min(rows.length - 1, at + step))]?.focus();
}

function focusParent(from: HTMLElement): void {
  const level = Number(from.getAttribute("aria-level"));
  if (level <= 1) return;
  const rows = rowsOf(from);
  for (let i = rows.indexOf(from) - 1; i >= 0; i--) {
    if (Number(rows[i].getAttribute("aria-level")) === level - 1) {
      rows[i].focus();
      return;
    }
  }
}
