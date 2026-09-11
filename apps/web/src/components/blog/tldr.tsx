/**
 * `<Tldr>` is the answer before the article: two to four lines a reader who
 * came for the result can leave with. Guides carry it where research posts
 * carry `KeyFindings`; the difference is that these lines are the outcome of
 * following the guide, not measurements, so there is no figure column and no
 * citation.
 *
 * Same surface as `KeyFindings` (rules top and bottom, no panel) so the two
 * read as the same furniture across the blog.
 */

export type TldrProps = {
  /** Two to four sentences. Each one stands on its own. */
  items: string[];
  title?: string;
};

export function Tldr({ items, title = "TL;DR" }: TldrProps) {
  return (
    <div className="border-border-strong my-[34px] border-b border-t pb-[18px] pt-[18px]">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.18em]">
          {title}
        </span>
        <span className="text-ink-faint font-mono text-[11px]">the short version</span>
      </div>
      <ul className="grid gap-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="text-ink grid grid-cols-[6px_1fr] items-baseline gap-x-3.5 text-[15.5px] leading-[1.5]"
          >
            <span aria-hidden="true" className="bg-primary h-[6px] w-[6px] rounded-[1px]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
