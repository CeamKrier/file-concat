import { useState } from "react";

import { formatCost } from "@fileconcat/core";

import { formatWindow, MODELS, SNAPSHOT, SUMMARIES } from "~/lib/context-window-costs";

/**
 * The priced table behind `/docs/context-window-costs`. The arithmetic and the
 * catalogue it reads live in `~/lib/context-window-costs`; this file is markup.
 *
 * It renders complete on the server: the summary covers all four sizes with no
 * interaction, so a crawler that never runs the click still gets every headline
 * number. Only the detail table below it depends on the selection.
 */

// `whitespace-nowrap` on both: at 320px a header wrapped to three lines and
// "295 of 310" broke after "of", which made the row twice as tall as its
// neighbours. The table scrolls inside its own container instead.
const HEAD_CELL =
  "border-hairline bg-surface-alt text-ink font-display whitespace-nowrap border-b px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.05em]";
const NUM_CELL =
  "border-hairline whitespace-nowrap border-b px-3 py-2.5 text-right font-mono tabular-nums";

export function ContextWindowCosts() {
  // The median repository, not the largest window. At 1,000,000 the two priced
  // columns hold the same value, because filling a million tokens costs exactly
  // the per-million rate, and a table with a duplicated column reads as a bug.
  // Leading with the measured size also puts our own number first.
  const [tokens, setTokens] = useState(236_218);
  const selected = SUMMARIES.find((summary) => summary.tokens === tokens) ?? SUMMARIES[0];

  return (
    <section className="mb-10">
      <p className="text-ink-faint mb-5 font-mono text-[11px] leading-[1.7]">
        {MODELS.length} models, snapshot {SNAPSHOT}. Regenerated from the models.dev catalogue by{" "}
        <span className="text-ink-muted">apps/web/scripts/fetch-models.ts</span> on every build, not
        maintained by hand.
      </p>

      <div className="border-border rounded-card mb-3 overflow-x-auto border">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">
            Cost of reading a context of each size once. Models counts how many in the catalogue
            accept that size; cheapest, median and dearest price it across those.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={HEAD_CELL}>
                Context
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Models
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Cheapest
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Median
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Dearest
              </th>
            </tr>
          </thead>
          <tbody>
            {SUMMARIES.map((summary) => {
              const active = summary.tokens === selected.tokens;

              return (
                <tr key={summary.tokens} className={active ? "bg-surface-alt" : undefined}>
                  <th scope="row" className="border-hairline border-b px-3 py-2 last:border-b-0">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTokens(summary.tokens)}
                      className={`focus-visible:ring-ring focus-visible:ring-offset-background rounded-input px-2.5 py-1 font-mono text-[13px] tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        active
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "border-border text-ink-secondary hover:text-ink border"
                      }`}
                    >
                      {formatWindow(summary.tokens)}
                    </button>
                  </th>
                  <td className={`${NUM_CELL} text-ink-muted last:border-b-0`}>
                    {summary.fitting.length} of {MODELS.length}
                  </td>
                  <td className={`${NUM_CELL} text-ink-secondary last:border-b-0`}>
                    {formatCost(summary.cheapest)}
                  </td>
                  <td className={`${NUM_CELL} text-ink font-semibold last:border-b-0`}>
                    {formatCost(summary.middle)}
                  </td>
                  <td className={`${NUM_CELL} text-ink-secondary last:border-b-0`}>
                    {formatCost(summary.dearest)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-ink-muted mb-10 text-[13.5px] leading-[1.6]">
        Pick a size to price it against every model below. 236K is the median repository bundle
        measured across 60 public repositories, not a round number.
      </p>

      <h3 className="text-ink font-display mb-4 text-[18px] font-semibold tracking-[-0.02em]">
        {selected.fitting.length} models accept {selected.tokens.toLocaleString()} tokens
      </h3>

      <div className="border-border rounded-card overflow-x-auto border">
        {/* Three columns, not four. A window column here reads 1M, 1M, 1M down
            a table that only lists models accepting a million tokens, and it
            pushed "to fill" off the right edge of a phone, which is the one
            number the page exists to show. `table-fixed` resolves percentages
            against the container, so the min-width keeps the numeric headers
            inside their cells and scrolls below that. */}
        <table className="w-full min-w-[360px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[52%]" />
            <col className="w-[24%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={HEAD_CELL}>
                Model
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Per 1M in
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                To fill
              </th>
            </tr>
          </thead>
          <tbody>
            {selected.fitting.map(({ model, cost }) => (
              <tr key={model.uid}>
                <td className="border-hairline border-b px-3 py-2.5 last:border-b-0">
                  <span className="text-ink block break-words">{model.name}</span>
                  <span className="text-ink-faint block break-words font-mono text-[11px]">
                    {model.providerName}
                  </span>
                </td>
                <td className={`${NUM_CELL} text-ink-secondary`}>{formatCost(model.inputCost)}</td>
                <td className={`${NUM_CELL} text-ink font-semibold`}>{formatCost(cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-muted mt-4 text-[13.5px] leading-[1.6]">
        Input only: what the model charges to read the context once. Output is billed separately and
        depends on what you ask for. Each row carries the cheapest listed provider for that model,
        which is often a gateway rather than the lab that trained it.
      </p>
    </section>
  );
}
