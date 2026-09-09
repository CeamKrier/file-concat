/**
 * `<Checklist>` is a short set of manual checks a reader runs on their own
 * output, with the finding that earns each one underneath it.
 *
 * Numbered in mono so it reads as a procedure rather than as a feature list,
 * and nothing here is interactive: no boxes to tick, no stored state. It is a
 * list of ten-second checks, not a form and not a marketing grid.
 */

export type ChecklistItem = {
  /** What to do, in the imperative. */
  check: string;
  /** The measured finding that makes the check worth the ten seconds. */
  why: string;
};

export type ChecklistProps = {
  label: string;
  items: ChecklistItem[];
  /** Overrides the generated "N checks, done by hand, in your own output". */
  note?: string;
};

export function Checklist({ label, items, note }: ChecklistProps) {
  return (
    <section className="rounded-chip border-border bg-surface-alt my-8 border p-4 sm:px-[22px] sm:py-5">
      <h3 className="font-display text-ink text-[17px] font-semibold tracking-[-0.02em] sm:text-[18px]">
        {label}
      </h3>
      <p className="text-ink-faint border-border mt-1.5 border-b pb-3.5 font-mono text-[11px]">
        {note ?? `${items.length} checks, done by hand, in your own output`}
      </p>

      <ol className="mt-4 grid list-none gap-4 pl-0">
        {items.map((item, i) => (
          <li key={item.check} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className="text-ink-faint w-[26px] flex-none pt-[3px] font-mono text-[11.5px] sm:w-[30px]"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-[14.5px] leading-[1.45] sm:text-[15.5px]">{item.check}</p>
              <p className="text-ink-muted mt-[5px] font-mono text-[11px] leading-[1.6] sm:text-[11.5px]">
                {item.why}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
