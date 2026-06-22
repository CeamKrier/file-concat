import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { ModelSelector } from "~/components/model-selector";
import { CostEstimate } from "~/components/cost-estimate";
import { CostComparison } from "~/components/cost-comparison";
import { useModels } from "~/hooks/use-models";
import type { FilteredModel, OutputFormat } from "@fileconcat/core";
import { cn } from "~/lib/utils";

interface TokenSectionProps {
  tokens: number;
  /** Current output format, so the fit readout can offer a real action. */
  selectedFormat?: OutputFormat;
  /** Switch the output to multi-part from the overflow guidance. */
  onSwitchToMultipart?: () => void;
}

const SELECTED_MODEL_KEY = "fileconcat-selected-model";
const OUTPUT_RATIO_KEY = "fileconcat-output-ratio";
const DEFAULT_OUTPUT_RATIO = 10;

/** Compact token count for the fit readout: 240000 → "240K", 1000000 → "1M". */
function formatCompact(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return tokens.toString();
}

/** Honest percentage label: never round non-zero usage down to a flat "0%". */
function formatPct(pct: number): string {
  if (pct > 0 && pct < 1) return "<1%";
  return `${pct.toFixed(0)}%`;
}

// Catalog uids switched from `providerId/modelId` to canonical `lab/model-id`.
// If the stored uid no longer matches any current model, try to recover the
// user's pick by suffix or normalized name; otherwise let the caller fall back
// to the default.
function migrateLegacyUid(storedUid: string, models: FilteredModel[]): FilteredModel | null {
  const segments = storedUid.split("/");
  if (segments.length < 2) return null;
  const legacyModelId = segments.slice(1).join("/").toLowerCase();
  const bySuffix = models.find((m) => {
    const tail = m.uid.split("/").slice(1).join("/").toLowerCase();
    return tail === legacyModelId;
  });
  if (bySuffix) return bySuffix;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(legacyModelId);
  return models.find((m) => norm(m.uid) === target || norm(m.name) === target) ?? null;
}

export function TokenSection({ tokens, selectedFormat, onSwitchToMultipart }: TokenSectionProps) {
  const { models, isLoading, error, lastUpdated, refresh } = useModels();
  const [selectedModel, setSelectedModel] = useState<FilteredModel | null>(null);
  const [outputRatioPercent, setOutputRatioPercent] = useState(DEFAULT_OUTPUT_RATIO);

  const pricedModels = useMemo(
    () => models.filter((model) => model.inputCost > 0 || model.outputCost > 0),
    [models],
  );

  useEffect(() => {
    const stored = localStorage.getItem(OUTPUT_RATIO_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(100, Math.max(0, parsed));
    setOutputRatioPercent(clamped);
  }, []);

  useEffect(() => {
    localStorage.setItem(OUTPUT_RATIO_KEY, String(outputRatioPercent));
  }, [outputRatioPercent]);

  // Load selected model from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY);
    if (stored && pricedModels.length > 0) {
      const exact = pricedModels.find((m) => m.uid === stored);
      if (exact) {
        setSelectedModel(exact);
        return;
      }
      const migrated = migrateLegacyUid(stored, pricedModels);
      if (migrated) {
        setSelectedModel(migrated);
        localStorage.setItem(SELECTED_MODEL_KEY, migrated.uid);
        return;
      }
    }
    // Default to first model with large context
    const defaultModel = pricedModels.find((m) => m.contextLimit >= 100000);
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [pricedModels]);

  const handleSelect = (model: FilteredModel) => {
    setSelectedModel(model);
    localStorage.setItem(SELECTED_MODEL_KEY, model.uid);
  };

  const outputRatio = outputRatioPercent / 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Token Usage</h3>
          <span className="text-muted-foreground text-sm">{tokens.toLocaleString()} tokens</span>
        </div>
        {selectedModel && (
          <CostEstimate model={selectedModel} inputTokens={tokens} outputRatio={outputRatio} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Output ratio</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={outputRatioPercent}
            onChange={(e) => setOutputRatioPercent(Number(e.target.value))}
            className="accent-primary h-2 w-40 cursor-pointer"
            aria-label="Output ratio percent"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={outputRatioPercent}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                setOutputRatioPercent(Math.min(100, Math.max(0, next)));
              }}
              className="border-input h-8 w-16 rounded-md border bg-transparent px-2 text-sm"
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
        </div>
        <span className="text-muted-foreground text-xs">
          Estimated output tokens = input * ratio
        </span>
      </div>

      {tokens > 0 && (
        <div className="flex justify-end">
          <CostComparison models={pricedModels} inputTokens={tokens} outputRatio={outputRatio} />
        </div>
      )}

      {/* Model Selector */}
      <ModelSelector
        models={pricedModels}
        selectedModel={selectedModel}
        onSelect={handleSelect}
        isLoading={isLoading}
        onRefresh={refresh}
        lastUpdated={lastUpdated}
      />

      {/* Error message */}
      {error && <p className="text-sm text-red-500">Failed to refresh models: {error}</p>}

      {/* Context-window fit: the signature moment, where color and guidance earn their place. */}
      {selectedModel && (
        <ContextFitReadout
          model={selectedModel}
          tokens={tokens}
          selectedFormat={selectedFormat}
          onSwitchToMultipart={onSwitchToMultipart}
        />
      )}
    </div>
  );
}

type FitTone = "ok" | "warn" | "over";

function describeFit(
  model: FilteredModel,
  tokens: number,
): { tone: FitTone; pct: number; headline: string; detail: string } {
  const limit = model.contextLimit;
  const pct = (tokens / limit) * 100;

  if (tokens > limit) {
    return {
      tone: "over",
      pct,
      headline: `Exceeds ${model.name}`,
      detail: `Over the ${formatCompact(limit)} window by ${(tokens - limit).toLocaleString()} tokens.`,
    };
  }
  if (pct > 80) {
    return {
      tone: "warn",
      pct,
      headline: `Fits ${model.name}, with little headroom`,
      detail: `${formatCompact(tokens)} of ${formatCompact(limit)} · ${formatPct(pct)} of the context window`,
    };
  }
  return {
    tone: "ok",
    pct,
    headline: `Fits ${model.name}`,
    detail: `${formatCompact(tokens)} of ${formatCompact(limit)} · ${formatPct(pct)} of the context window`,
  };
}

function ContextFitReadout({
  model,
  tokens,
  selectedFormat,
  onSwitchToMultipart,
}: {
  model: FilteredModel;
  tokens: number;
  selectedFormat?: OutputFormat;
  onSwitchToMultipart?: () => void;
}) {
  const fit = describeFit(model, tokens);
  const Icon = fit.tone === "ok" ? Check : AlertTriangle;
  const iconColor =
    fit.tone === "ok"
      ? "text-primary"
      : fit.tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  const barColor =
    fit.tone === "ok" ? "bg-primary" : fit.tone === "warn" ? "bg-amber-500" : "bg-destructive";
  const showSwitch = fit.tone === "over" && !!onSwitchToMultipart && selectedFormat === "single";

  return (
    <div
      className={cn(
        "space-y-2.5",
        fit.tone === "over" && "border-destructive/30 bg-destructive/5 rounded-lg border p-3",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {fit.headline}{" "}
            <span className="text-muted-foreground text-xs font-normal">
              via {model.providerName}
            </span>
          </p>
          <p className="text-muted-foreground text-[13px]">{fit.detail}</p>
        </div>
        {showSwitch && (
          <button
            type="button"
            onClick={onSwitchToMultipart}
            className="border-border/70 bg-background hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            Use multi-part
          </button>
        )}
      </div>
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(Math.min(fit.pct, 100))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Context window usage: ${fit.pct.toFixed(0)}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(fit.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
