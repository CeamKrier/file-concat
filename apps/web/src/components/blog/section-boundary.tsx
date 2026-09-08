import type { ComponentProps } from "react";

/**
 * The `##` of a blog post, rendered as a boundary a fast scroller can see.
 *
 * Four parts, in this order: a rule that breaks past the prose column, the
 * section counter, the heading, and the summary line under it (that last part
 * is the `data-lede` paragraph, styled in the prose rules rather than here).
 *
 * No eyebrow label. The counter does the same job in a quarter of the space and
 * carries orientation with it, which an eyebrow does not: "04 of 12" answers
 * how much is left, and it is the only reason the contents block can stay a
 * single list at the top instead of a rail that follows the reader down.
 *
 * `id`, `data-index` and `data-total` are set at compile time by
 * `scripts/remark-blog-sections.mjs`. A heading rendered without them still
 * works and simply loses the counter, which is what docs pages get.
 */
export function SectionBoundary({
  children,
  id,
  ...rest
}: ComponentProps<"h2"> & { "data-index"?: string; "data-total"?: string }) {
  const index = rest["data-index"];
  const total = rest["data-total"];

  return (
    <div className="fc-breakout mb-4 mt-10 sm:mt-14">
      <span aria-hidden="true" className="bg-border-strong mb-5 block h-px w-full sm:mb-6" />
      <div className="fc-measure">
        {index ? (
          <p className="mb-2.5 font-mono text-[11.5px] tracking-[0.04em]">
            <span className="text-go-fg">{index}</span>
            {total ? <span className="text-ink-faint"> of {total}</span> : null}
          </p>
        ) : null}
        <h2
          id={id}
          className="text-ink font-display scroll-mt-[76px] text-[25px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[30px]"
          style={{ textWrap: "balance" }}
        >
          {children}
        </h2>
      </div>
    </div>
  );
}
