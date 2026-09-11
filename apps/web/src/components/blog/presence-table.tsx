import { Check, Minus, X, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * `<PresenceTable>` is the document smoke test as a grid: one row per tool,
 * one column per file, and each cell says whether that file's sentence
 * reached the bundle.
 *
 * Three states, each carried three ways (colour, a drawn mark, the word), so
 * the row pattern reads from across the room and still reads in monochrome
 * or through a screen reader. The words stay in the cells rather than in a
 * legend because the cells are what gets quoted.
 */

export type Presence = "text" | "listed" | "absent";

export type PresenceTableProps = {
  /** Column headings, one per file. */
  columns: string[];
  rows: { tool: string; cells: Presence[] }[];
};

const OURS = "FileConcat";

const STATES: Record<Presence, { label: string; Icon: LucideIcon; className: string }> = {
  text: { label: "text", Icon: Check, className: "text-go-fg bg-[oklch(var(--go)/0.12)]" },
  listed: {
    label: "listed, no text",
    Icon: Minus,
    className: "text-info bg-[oklch(var(--info)/0.12)]",
  },
  absent: {
    label: "absent",
    Icon: X,
    className: "text-stop-fg bg-[oklch(var(--destructive)/0.14)]",
  },
};

export function PresenceTable({ columns, rows }: PresenceTableProps) {
  return (
    <div className="fc-breakout border-border rounded-card my-7 overflow-x-auto border">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            <th className="border-hairline bg-surface-alt text-ink font-display border-b px-4 py-2.5 text-left text-[12.5px] font-semibold uppercase tracking-[0.05em]">
              Tool
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="border-hairline bg-surface-alt text-ink border-b px-4 py-2.5 text-left font-mono text-[12px] font-medium"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tool} className="border-hairline [&:not(:last-child)]:border-b">
              <td
                className={cn(
                  "px-4 py-2 font-mono text-[13px]",
                  r.tool === OURS ? "text-primary" : "text-ink-secondary",
                )}
              >
                {r.tool}
              </td>
              {r.cells.map((cell, i) => {
                const { label, Icon, className } = STATES[cell];
                return (
                  <td key={columns[i]} className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] py-0.5 pl-1.5 pr-2 text-[13px] font-medium",
                        className,
                      )}
                    >
                      <Icon aria-hidden="true" size={13} strokeWidth={2.5} />
                      {label}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
