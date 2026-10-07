import { READ_FORMATS, type FormatGroup } from "~/data/formats";

/**
 * The list behind `/docs/formats`, rendered from `~/data/formats` on the server
 * so a crawler reads every row. Grouped by what the file is, one entry per
 * family a person would name, each saying what comes through and what does not.
 */
export function FormatsTable() {
  const groups = [...new Set(READ_FORMATS.map((entry) => entry.group))] as FormatGroup[];

  return (
    <div className="mb-10 space-y-8">
      {groups.map((group) => (
        <section key={group} aria-labelledby={`formats-${slug(group)}`}>
          <h3
            id={`formats-${slug(group)}`}
            className="font-display text-ink mb-3 text-[15px] font-semibold tracking-[-0.01em]"
          >
            {group}
          </h3>
          <ul className="border-border rounded-card divide-hairline divide-y border">
            {READ_FORMATS.filter((entry) => entry.group === group).map((entry) => (
              <li key={entry.name} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-ink text-[14.5px] font-semibold">{entry.name}</span>
                  <span className="text-ink-muted font-mono text-[11.5px]">
                    {entry.how === "auto" ? "read on drop" : "read when you ask"}
                  </span>
                </div>
                <p className="text-code mt-1 break-words font-mono text-[12px]">
                  {entry.extensions.map((ext) => `.${ext}`).join(" ")}
                </p>
                <dl className="mt-2.5 grid gap-1.5 text-[14px] leading-relaxed sm:grid-cols-[9rem_1fr] sm:gap-x-4">
                  <dt className="text-ink-muted">Comes through</dt>
                  <dd className="text-ink">{entry.gives}</dd>
                  <dt className="text-ink-muted">Left out</dt>
                  <dd className="text-ink">{entry.loses}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
