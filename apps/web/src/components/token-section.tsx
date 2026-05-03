import { useState, useEffect, useMemo } from "react";
import { ModelSelector } from "~/components/model-selector";
import { CostEstimate } from "~/components/cost-estimate";
import { CostComparison } from "~/components/cost-comparison";
import { useModels } from "~/hooks/use-models";
import type { FilteredModel } from "@fileconcat/core";

interface TokenSectionProps {
  tokens: number;
}

const SELECTED_MODEL_KEY = "fileconcat-selected-model";
const OUTPUT_RATIO_KEY = "fileconcat-output-ratio";
const DEFAULT_OUTPUT_RATIO = 10;

function formatLimit(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  }
  return `${(tokens / 1_000).toFixed(0)}K tokens`;
}

export function TokenSection({ tokens }: TokenSectionProps) {
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
      const model = pricedModels.find((m) => m.uid === stored);
      if (model) {
        setSelectedModel(model);
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

  const percentage = selectedModel ? (tokens / selectedModel.contextLimit) * 100 : 0;
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

      {/* Progress Bar */}
      {selectedModel && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>
              <span className="font-bold">{selectedModel.providerName}</span>{" "}
              <span className="text-muted-foreground">{selectedModel.name}</span>
            </span>
            <span className={percentage > 100 ? "text-red-500" : "text-muted-foreground"}>
              {percentage.toFixed(1)}% of {formatLimit(selectedModel.contextLimit)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-2 rounded-full transition-all ${
                percentage > 100
                  ? "bg-red-500"
                  : percentage > 90
                    ? "bg-red-500"
                    : percentage > 70
                      ? "bg-yellow-500"
                      : "bg-green-500"
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          {percentage > 100 && (
            <p className="text-xs text-red-500">
              Content exceeds model context window by{" "}
              {(tokens - selectedModel.contextLimit).toLocaleString()} tokens
            </p>
          )}
        </div>
      )}
    </div>
  );
}
