import type { CSSProperties } from "react";

/**
 * `<ContextFunnel>` shows how much of a dropped folder actually reaches the
 * model: the file counts falling stage by stage, then the one place the unit
 * changes, from files to tokens.
 *
 * Four forms ship, all driven by the same props, because an article picks the
 * one that fits its argument: `bars` when the reductions are the story,
 * `ledger` when the counts matter more than the ratios, `columns` when the drop
 * between stages is the point, `one-bar` when space is short. The token figure
 * is never drawn on the file scale in any of them.
 *
 * Deliberately free of the ingestion engine so the live version inside `TryIt`
 * can pass measured numbers in without pulling the tool into an article's first
 * chunk.
 */

export type FunnelStage = {
  /** Stage name, for example "text eligible". */
  label: string;
  /** File count at this stage. */
  value: number;
  /** Why files were lost since the previous stage, for example "no readable text". */
  lost?: string;
};

export type FunnelModel = {
  name: string;
  /** 0 to 1. Share of this model's context window the bundle fills. */
  contextShare: number;
  /** Input cost of one send, in USD. */
  inputCost: number;
  /** Window size for the short form, for example "1M". */
  window?: string;
};

export type ContextFunnelProps = {
  /** Two or more file-count stages, largest first. */
  stages: FunnelStage[];
  /** Tokens the kept files assemble into. */
  tokens: number;
  form?: "bars" | "ledger" | "columns" | "one-bar";
  /** Eyebrow label. */
  label?: string;
  /** Optional tail. Omitted when no model is selected. */
  model?: FunnelModel;
  /** One line under the stages, for the case where nothing was filtered out. */
  note?: string;
};

const num = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const TRACK = "oklch(var(--accent))";
const FILL = "oklch(var(--primary))";

function hatch(a: string, b: string) {
  return `repeating-linear-gradient(135deg,${a} 0 4px,${b} 4px 8px)`;
}

/** Files lost on the way into each stage. Index 0 is always null. */
function drops(stages: FunnelStage[]) {
  return stages.map((stage, i) => {
    if (i === 0) return null;
    const from = stages[i - 1].value;
    const count = from - stage.value;
    return { count, share: from ? count / from : 0, reason: stage.lost };
  });
}

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="text-ink-faint font-mono text-[11px] uppercase tracking-[0.16em]">
      {children}
    </span>
  );
}

function TokenFigure({ value, size = 38 }: { value: number; size?: number }) {
  return (
    <div>
      <div
        className="font-display text-ink font-semibold leading-none tracking-[-0.03em] tabular-nums"
        style={{ fontSize: size }}
      >
        {num(value)}
      </div>
      <div className="text-ink-faint mt-2 font-mono text-[11px] uppercase tracking-[0.12em]">
        tokens of context
      </div>
    </div>
  );
}

/**
 * Both figures round to zero on a small bundle, and "0.0% of the window / 0.00
 * USD" reads as a broken readout rather than a cheap one. Below what each scale
 * can show, say so as a bound instead of printing a zero that is not true.
 */
const share = (v: number) => (v > 0 && v < 0.001 ? "<0.1%" : pct(v));
const usd = (v: number) => (v > 0 && v < 0.005 ? "<0.01 USD" : `${v.toFixed(2)} USD`);

function Tail({ model }: { model: FunnelModel }) {
  return (
    <div className="border-border text-ink-muted mt-[18px] flex flex-wrap items-baseline gap-x-6 gap-y-2.5 border-t pt-3.5 font-mono text-[11.5px]">
      <span className="text-ink-secondary">{model.name}</span>
      <span>{share(model.contextShare)} of the window</span>
      <span>{usd(model.inputCost)} per send</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border-border rounded-chip my-8 border p-5">{children}</div>
  );
}

export function ContextFunnel({
  stages,
  tokens,
  form = "bars",
  label = "Context funnel",
  model,
  note,
}: ContextFunnelProps) {
  const base = stages[0]?.value ?? 0;
  const kept = stages[stages.length - 1]?.value ?? 0;
  const lost = drops(stages);
  const perFile = kept ? Math.round(tokens / kept) : 0;

  if (form === "ledger") {
    return (
      <Shell>
        <div className="mb-4 flex items-baseline justify-between gap-2.5">
          <Eyebrow>{label}</Eyebrow>
        </div>
        <div className="grid gap-1.5">
          {stages.map((stage) => {
            const share = base ? stage.value / base : 0;
            return (
              <div
                key={stage.label}
                className="border-border bg-surface-alt rounded-chip relative overflow-hidden border"
              >
                <span
                  className="bg-primary/10 absolute inset-y-0 left-0"
                  style={{ width: pct(share) }}
                />
                <div className="relative flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-3.5 py-3">
                  <span className="font-display text-ink min-w-[104px] text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                    {num(stage.value)}
                  </span>
                  <span className="text-ink-secondary flex-1 text-[13.5px]">{stage.label}</span>
                  <span className="text-ink-faint font-mono text-[11px]">{pct(share)}</span>
                </div>
              </div>
            );
          })}
          <div className="border-primary/25 bg-surface-inset rounded-chip border">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-3.5 py-3">
              <span className="font-display text-primary min-w-[104px] text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                {num(tokens)}
              </span>
              <span className="text-ink-secondary flex-1 text-[13.5px]">tokens of context</span>
              <span className="text-ink-faint font-mono text-[11px]">new unit</span>
            </div>
          </div>
        </div>
        {model ? <Tail model={model} /> : null}
      </Shell>
    );
  }

  if (form === "columns") {
    const tallest = 130;
    return (
      <Shell>
        <div className="mb-[22px] flex items-baseline justify-between gap-2.5">
          <Eyebrow>{label}</Eyebrow>
        </div>
        <div
          className="grid h-[170px] items-end gap-2.5"
          style={{ gridTemplateColumns: `repeat(${stages.length},1fr) 4px 1fr` }}
        >
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex h-full flex-col justify-end gap-2">
              <span className="text-ink font-mono text-[13px] tabular-nums">
                {num(stage.value)}
              </span>
              <span
                className="rounded-t"
                style={{
                  height: base ? Math.round((stage.value / base) * tallest) : 0,
                  background: i === 0 ? FILL : `oklch(var(--primary) / ${1 - i * 0.3})`,
                }}
              />
            </div>
          ))}
          <span
            className="mx-auto h-[150px] w-px"
            style={{
              background:
                "repeating-linear-gradient(to bottom,oklch(var(--border-strong)) 0 5px,transparent 5px 10px)",
            }}
          />
          <div className="flex h-full flex-col justify-end gap-2">
            <span className="text-primary font-mono text-[13px] tabular-nums">{num(tokens)}</span>
            <span
              className="border-primary/25 h-24 rounded-t border border-b-0 border-dashed"
              style={{
                background:
                  "repeating-linear-gradient(135deg,oklch(var(--primary) / 0.14) 0 4px,transparent 4px 8px)",
              }}
            />
          </div>
        </div>
        <div
          className="border-border mt-2.5 grid gap-2.5 border-t pt-2.5"
          style={{ gridTemplateColumns: `repeat(${stages.length},1fr) 4px 1fr` }}
        >
          {stages.map((stage) => (
            <span
              key={stage.label}
              className="text-ink-secondary text-[11.5px] leading-[1.35]"
            >
              {stage.label}
            </span>
          ))}
          <span />
          <span className="text-ink-muted text-[11.5px] leading-[1.35]">
            tokens
            <br />
            own scale
          </span>
        </div>
        {model ? <Tail model={model} /> : null}
      </Shell>
    );
  }

  if (form === "one-bar") {
    // Kept first, then each reduction in reverse order, so the bar reads from
    // what survived out to what never had a chance.
    const parts = [
      { value: kept, label: "kept", fill: FILL, accent: true },
      ...lost
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .reverse()
        .map((d, i) => ({
          value: d.count,
          label: d.reason ?? "removed",
          fill: i === 0 ? hatch("#3a3227", "#241f18") : hatch("#2c261d", "#1e1a14"),
          accent: false,
        })),
    ].filter((p) => p.value > 0);

    return (
      <Shell>
        <div className="mb-[18px] flex items-baseline justify-between gap-2.5">
          <Eyebrow>{label}</Eyebrow>
        </div>
        <div className="mb-3 flex h-[26px] gap-0.5 overflow-hidden rounded">
          {parts.map((part) => (
            <span
              key={part.label}
              style={{ width: pct(base ? part.value / base : 0), background: part.fill }}
            />
          ))}
        </div>
        <div className="text-ink-muted grid gap-x-[18px] gap-y-2 font-mono text-[11.5px] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {parts.map((part, i) => (
            <span key={part.label}>
              <span className={part.accent ? "text-primary" : "text-ink-secondary"}>
                {num(part.value)}
              </span>{" "}
              {part.label}
              {i === 0 ? `, ${pct(base ? part.value / base : 0)}` : ""}
            </span>
          ))}
        </div>
        <div className="border-border mt-5 flex flex-wrap items-end justify-between gap-x-[26px] gap-y-3.5 border-t pt-4">
          <TokenFigure value={tokens} size={34} />
          {/* `grow` so the right-aligned block still reaches the card edge once
              flex-wrap drops it onto its own line. Without it a wrapped line
              starts at flex-start and the text right-aligns to nothing. */}
          <div className="text-ink-muted grow text-right font-mono text-[11.5px] leading-[1.65]">
            {num(base)} files in
            {model ? (
              <>
                <br />
                {pct(model.contextShare)} of a {model.window ?? model.name} window
              </>
            ) : null}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5 flex items-baseline justify-between gap-2.5">
        <Eyebrow>{label}</Eyebrow>
      </div>

      <div className="grid gap-[9px]">
        {stages.map((stage, i) => {
          const share = base ? stage.value / base : 0;
          const drop = lost[i];
          const bar: CSSProperties =
            share >= 1
              ? { background: FILL }
              : {
                  background: `linear-gradient(to right,${FILL} ${pct(share)},${TRACK} ${pct(share)})`,
                };
          return (
            <div key={stage.label} className="contents">
              {drop && drop.count > 0 ? (
                <div className="text-ink-muted font-mono text-[11px] leading-[1.4] sm:pl-[138px]">
                  minus {num(drop.count)}
                  {drop.reason ? `, ${drop.reason}` : ""} ({pct(drop.share)})
                </div>
              ) : null}
              <div className="grid grid-cols-[minmax(96px,124px)_1fr_auto] items-center gap-3.5">
                <span
                  className={
                    i === stages.length - 1
                      ? "text-ink text-[13.5px]"
                      : "text-ink-secondary text-[13.5px]"
                  }
                >
                  {stage.label}
                </span>
                <span className="h-2.5 rounded-[3px]" style={bar} />
                <span className="text-ink min-w-[66px] text-right font-mono text-sm tracking-[-0.01em] tabular-nums">
                  {num(stage.value)}
                </span>
              </div>
            </div>
          );
        })}
        {note ? <div className="text-ink-muted font-mono text-[11px]">{note}</div> : null}
      </div>

      <div className="my-4 flex items-center gap-3">
        <span
          className="h-px flex-1"
          style={{
            background:
              "repeating-linear-gradient(to right,oklch(var(--border-strong)) 0 5px,transparent 5px 10px)",
          }}
        />
        <span className="text-ink-faint font-mono text-[10.5px] tracking-[0.06em]">
          unit changes, files to tokens
        </span>
        <span
          className="h-px flex-1"
          style={{
            background:
              "repeating-linear-gradient(to right,oklch(var(--border-strong)) 0 5px,transparent 5px 10px)",
          }}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-7 gap-y-4">
        <TokenFigure value={tokens} />
        {/* See the note on the same pair in the compact form. */}
        <div className="text-ink-muted grow text-right font-mono text-[11.5px] leading-[1.65]">
          from {num(kept)} files
          <br />
          {num(perFile)} tokens per file, average
        </div>
      </div>

      {model ? <Tail model={model} /> : null}
    </Shell>
  );
}
