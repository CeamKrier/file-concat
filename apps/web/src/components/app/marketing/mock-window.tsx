import { cn } from "~/lib/utils";

/**
 * The three-dot window chrome shared by the static mocks (folder trees, output
 * samples). Chrome only — the body is bespoke per use, so pages stay distinct
 * rather than templated. `label` is the filename/title in the title bar; an
 * optional `trailing` sits at the right (e.g. a token count).
 */
export function MockWindow({
  label,
  trailing,
  tone = "inset",
  children,
  className,
}: {
  label: string;
  trailing?: React.ReactNode;
  tone?: "inset" | "cli";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border rounded-card overflow-hidden border",
        tone === "cli" ? "bg-surface-cli" : "bg-surface-inset",
        className,
      )}
    >
      <div className="border-hairline flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-ink-faint h-2 w-2 rounded-full" />
          <span className="bg-ink-faint h-2 w-2 rounded-full" />
          <span className="bg-ink-faint h-2 w-2 rounded-full" />
          <span className="text-ink-muted ml-2 truncate font-mono text-[11.5px]">{label}</span>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children}
    </div>
  );
}
