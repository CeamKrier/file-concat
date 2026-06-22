import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, RefreshCw, Star, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import Badge from "~/components/ui/badge";
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
  if (typeof window === "undefined") return new Set();
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

function formatCost(inputCost: number, outputCost: number): string {
  if (inputCost === 0 && outputCost === 0) return "Pricing N/A";
  if (inputCost === 0) return "Free";
  if (inputCost < 0.01) return `$${inputCost.toFixed(4)}`;
  if (inputCost < 1) return `$${inputCost.toFixed(2)}`;
  return `$${inputCost.toFixed(2)}`;
}

function hasPricing(model: FilteredModel): boolean {
  return model.inputCost > 0 || model.outputCost > 0;
}

function normalizeSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenizeSearchValue(value: string): string[] {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  return Array.from(new Set([normalized, ...tokens]));
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);

  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function getFuzzyScore(query: string, target: string): number | null {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 0;

  const candidates = tokenizeSearchValue(target);
  if (candidates.length === 0) return null;

  const maxDistance = Math.max(2, Math.floor(normalizedQuery.length * 0.4));
  let bestScore: number | null = null;

  for (const candidate of candidates) {
    if (candidate.includes(normalizedQuery)) {
      return 0;
    }

    const distance = levenshteinDistance(normalizedQuery, candidate);
    if (distance <= maxDistance) {
      const score = 2 + distance;
      bestScore = bestScore === null ? score : Math.min(bestScore, score);
    }
  }

  return bestScore;
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
    const trimmedSearch = search.trim();
    const pricedModels = models.filter(hasPricing);
    const scored = trimmedSearch
      ? pricedModels
          .map((model) => ({
            model,
            score:
              getFuzzyScore(trimmedSearch, model.name) ??
              getFuzzyScore(trimmedSearch, model.providerName) ??
              getFuzzyScore(trimmedSearch, model.uid),
          }))
          .filter((item): item is { model: FilteredModel; score: number } => item.score !== null)
          .sort((a, b) => a.score - b.score)
          .map((item) => item.model)
      : pricedModels;

    const filtered = scored;

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
          <span className="min-w-0 truncate text-sm font-medium">{model.name}</span>
          {model.hasReasoning && (
            <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px]">
              Reasoning
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span className="min-w-0 truncate" title={model.providerName}>
            via {model.providerName}
          </span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {formatTokenLimit(model.contextLimit)} ctx
          </span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {formatCost(model.inputCost, model.outputCost)}/1M in
          </span>
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
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate">{selectedModel.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs font-normal">
                  via {selectedModel.providerName}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Select model...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(380px,calc(100vw-2rem))] p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-auto border-0 p-0 focus-visible:ring-0"
            />
          </div>
          <div className="h-[300px] overflow-x-hidden overflow-y-auto">
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
          </div>
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
