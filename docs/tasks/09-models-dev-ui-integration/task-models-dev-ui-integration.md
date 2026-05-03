# Task 09: Model Data UI Entegrasyonu

## Ozet

models.dev verisini mevcut token estimation UI'ina entegre et. Model selector dropdown, dinamik context limits ve cost estimation ekle.

## Oncelik

Yuksek (Faz 2 - Model Data)

## Bagimliliklari

- Task 08: Server Function (tamamlanmis)
- Task 07: Build Script (tamamlanmis)

## Basari Kriterleri

- [ ] Model selector dropdown calisiyor
- [ ] Secilen modele gore context limit bar guncelleniyor
- [ ] Cost estimation gosteriliyor
- [ ] Refresh Models butonu calisiyor
- [ ] Favoriler localStorage'da saklanıyor

## Detayli Adimlar

### 1. Model Selector Component

**Dosya:** `apps/web/src/components/model-selector.tsx` (yeni)

```tsx
import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, RefreshCw, Star, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import type { FilteredModel } from "@fileconcat/core";
import { cn } from "~/lib/utils";

interface ModelSelectorProps {
  models: FilteredModel[];
  selectedModel: FilteredModel | null;
  onSelect: (model: FilteredModel) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  lastUpdated?: string | null;
}

// Favorite models storage
const FAVORITES_KEY = "fileconcat-favorite-models";

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch (e) {
    console.warn("Failed to save favorites:", e);
  }
}

function formatTokenLimit(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}

export function ModelSelector({
  models,
  selectedModel,
  onSelect,
  isLoading,
  onRefresh,
  lastUpdated,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  // Filter and group models
  const { favoriteModels, filteredModels } = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = models.filter(
      (m) =>
        m.name.toLowerCase().includes(searchLower) ||
        m.providerName.toLowerCase().includes(searchLower) ||
        m.id.toLowerCase().includes(searchLower),
    );

    const favs = filtered.filter((m) => favorites.has(m.uid));
    const rest = filtered.filter((m) => !favorites.has(m.uid));

    return {
      favoriteModels: favs,
      filteredModels: rest,
    };
  }, [models, search, favorites]);

  const toggleFavorite = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(uid)) {
      newFavorites.delete(uid);
    } else {
      newFavorites.add(uid);
    }
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
  };

  const ModelItem = ({ model }: { model: FilteredModel }) => (
    <div
      className={cn(
        "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
        selectedModel?.uid === model.uid && "bg-accent",
      )}
      onClick={() => {
        onSelect(model);
        setOpen(false);
      }}
    >
      <button
        className="shrink-0 p-0.5 hover:text-yellow-500"
        onClick={(e) => toggleFavorite(model.uid, e)}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            favorites.has(model.uid) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground",
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{model.name}</span>
          {model.hasReasoning && (
            <Badge variant="secondary" className="px-1 py-0 text-[10px]">
              Reasoning
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>{model.providerName}</span>
          <span>•</span>
          <span>{formatTokenLimit(model.contextLimit)} ctx</span>
          <span>•</span>
          <span>{formatCost(model.inputCost)}/1M in</span>
        </div>
      </div>
      {selectedModel?.uid === model.uid && <Check className="text-primary h-4 w-4 shrink-0" />}
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedModel ? (
              <span className="truncate">
                {selectedModel.providerName} {selectedModel.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Select model...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-auto border-0 p-0 focus-visible:ring-0"
            />
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1 p-2">
              {favoriteModels.length > 0 && (
                <>
                  <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                    Favorites
                  </div>
                  {favoriteModels.map((model) => (
                    <ModelItem key={model.uid} model={model} />
                  ))}
                  <div className="my-2 border-t" />
                </>
              )}
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => <ModelItem key={model.uid} model={model} />)
              ) : (
                <div className="text-muted-foreground px-2 py-4 text-center text-sm">
                  No models found
                </div>
              )}
            </div>
          </ScrollArea>
          {lastUpdated && (
            <div className="text-muted-foreground border-t px-3 py-2 text-xs">
              Updated: {new Date(lastUpdated).toLocaleDateString()}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {onRefresh && (
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh models from API"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      )}
    </div>
  );
}
```

### 2. Cost Estimation Component

**Dosya:** `apps/web/src/components/cost-estimate.tsx` (yeni)

```tsx
import { useMemo } from "react";
import { DollarSign, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import type { FilteredModel } from "@fileconcat/core";

interface CostEstimateProps {
  model: FilteredModel | null;
  inputTokens: number;
  /** Estimated output ratio (0-1), default 0.1 */
  outputRatio?: number;
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function CostEstimate({ model, inputTokens, outputRatio = 0.1 }: CostEstimateProps) {
  const estimate = useMemo(() => {
    if (!model || inputTokens === 0) return null;

    const estimatedOutputTokens = Math.round(inputTokens * outputRatio);
    const inputCost = (inputTokens / 1_000_000) * model.inputCost;
    const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputCost;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      estimatedOutputTokens,
    };
  }, [model, inputTokens, outputRatio]);

  if (!model || !estimate) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <DollarSign className="text-muted-foreground h-4 w-4" />
      <span className="font-medium">{formatCurrency(estimate.totalCost)}</span>
      <span className="text-muted-foreground">estimated</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Info className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-2">
            <h4 className="font-medium">Cost Breakdown</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input tokens:</span>
                <span>{inputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input cost:</span>
                <span>{formatCurrency(estimate.inputCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. output tokens:</span>
                <span>{estimate.estimatedOutputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Output cost:</span>
                <span>{formatCurrency(estimate.outputCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>Total:</span>
                <span>{formatCurrency(estimate.totalCost)}</span>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Based on {model.providerName} {model.name} pricing. Output estimated at{" "}
              {(outputRatio * 100).toFixed(0)}% of input.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

### 3. Token Info Section Guncelleme

Mevcut token progress bars yerine yeni model-aware section:

**Dosya:** `apps/web/src/components/token-section.tsx` (yeni)

```tsx
import { useState, useEffect } from "react";
import { ModelSelector } from "~/components/model-selector";
import { CostEstimate } from "~/components/cost-estimate";
import { useModels } from "~/hooks/use-models";
import type { FilteredModel } from "@fileconcat/core";

interface TokenSectionProps {
  tokens: number;
}

const SELECTED_MODEL_KEY = "fileconcat-selected-model";

export function TokenSection({ tokens }: TokenSectionProps) {
  const { models, isLoading, error, lastUpdated, refresh } = useModels();
  const [selectedModel, setSelectedModel] = useState<FilteredModel | null>(null);

  // Load selected model from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY);
    if (stored && models.length > 0) {
      const model = models.find((m) => m.uid === stored);
      if (model) {
        setSelectedModel(model);
        return;
      }
    }
    // Default to first model with large context
    const defaultModel = models.find((m) => m.contextLimit >= 100000);
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [models]);

  const handleSelect = (model: FilteredModel) => {
    setSelectedModel(model);
    localStorage.setItem(SELECTED_MODEL_KEY, model.uid);
  };

  const percentage = selectedModel ? (tokens / selectedModel.contextLimit) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Token Usage</h3>
          <span className="text-muted-foreground text-sm">{tokens.toLocaleString()} tokens</span>
        </div>
        {selectedModel && <CostEstimate model={selectedModel} inputTokens={tokens} />}
      </div>

      {/* Model Selector */}
      <ModelSelector
        models={models}
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

function formatLimit(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  }
  return `${(tokens / 1_000).toFixed(0)}K tokens`;
}
```

### 4. FileConcat Component Entegrasyonu

**Dosya:** `apps/web/src/components/file-concat.tsx`

Mevcut token section'i yeni component ile degistir:

```tsx
// Import ekle
import { TokenSection } from "~/components/token-section";

// Mevcut LLM_CONTEXT_LIMITS kullanimini kaldir
// import { LLM_CONTEXT_LIMITS, ... } from "@fileconcat/core";

// Render kisminda degistir:
// Eski:
// {tokens > 0 && (
//   <div className="space-y-4">
//     ... LLM_CONTEXT_LIMITS.map ...
//   </div>
// )}

// Yeni:
{
  tokens > 0 && <TokenSection tokens={tokens} />;
}
```

## Test Etme

```bash
cd apps/web
pnpm dev

# Test checklist:
# [ ] Model selector aciliyor
# [ ] Model arama calisiyor
# [ ] Model secimi context bar'i guncelliyor
# [ ] Favoriler kaydediliyor (refresh sonrasi korunuyor)
# [ ] Refresh Models butonu calisiyor
# [ ] Cost estimate dogru hesaplaniyor
# [ ] 100%+ usage kirmizi gosteriliyor
```

## Notlar

- Mevcut hardcoded LLM_CONTEXT_LIMITS yerine dinamik veri
- Backward compat: constants.ts'teki LLM_CONTEXT_LIMITS korunuyor
- Favoriler ve selected model localStorage'da
- Cost estimation varsayilan %10 output ratio

## Rollback

```bash
rm apps/web/src/components/model-selector.tsx
rm apps/web/src/components/cost-estimate.tsx
rm apps/web/src/components/token-section.tsx
# file-concat.tsx'te eski LLM_CONTEXT_LIMITS kullanimina don
```
