export type LabeledPoint = { label: string; body: React.ReactNode };

/**
 * A short list of mono-labeled points. The label sits in its own column so the
 * eye can scan the categories without each row becoming a card. Used for the
 * output structure (tree / tags / fences) and the CLI traits (pipe / parse /
 * json) — never as a section eyebrow.
 */
export function LabeledPoints({ items }: { items: LabeledPoint[] }) {
  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
      {items.map((item) => (
        <li key={item.label} className="grid gap-y-1 sm:col-span-2 sm:grid-cols-subgrid">
          <span className="text-ink-muted font-mono text-[11px] uppercase tracking-[0.14em] sm:mt-[3px]">
            {item.label}
          </span>
          <p className="text-ink-secondary min-w-0 text-[14px] leading-relaxed">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}
