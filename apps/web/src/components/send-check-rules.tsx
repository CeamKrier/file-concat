import { KEY_RULES } from "@fileconcat/core";

import { CONN } from "~/components/app/send-check";

/**
 * The list behind `/docs/send-check`, rendered from the detector's own rules
 * (`packages/core/src/file-processing/send-check.ts`) on the server, so the page
 * cannot name a key the check does not find or miss one it does. Rules that
 * share a readable name (five GitHub token shapes) are one row.
 */
export function SendCheckRules() {
  const rows = new Map<string, string[]>();
  for (const rule of KEY_RULES) {
    if (rule.id === CONN) continue;
    rows.set(rule.label, [...(rows.get(rule.label) ?? []), rule.id]);
  }

  return (
    <ul className="border-border rounded-card divide-hairline mb-10 divide-y border">
      {[...rows].map(([label, ids]) => (
        <li key={label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
          <span className="text-ink min-w-0 text-[14.5px] font-semibold">{label === "private key" ? "Private key" : label}</span>
          <code className="text-code min-w-0 break-words font-mono text-[12px]">[Secret removed: {label}]</code>
          <span className="text-ink-muted w-full min-w-0 break-words font-mono text-[11.5px]">
            gitleaks: {ids.join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
