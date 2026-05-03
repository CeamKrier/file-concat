# Task 19: Cost Estimation Enhancement

## Ozet

Token sayisina gore tahmini API maliyeti gosterme. Task 09'da basic implementation var, bu task enhancement'lar icin.

## Oncelik

Dusuk (Faz 4 - UX)

## Bagimliliklari

- Task 09: Model Data UI Integration (tamamlanmis)

## Basari Kriterleri

- [ ] Farkli output ratio'lar secebilme
- [ ] Multiple model karsilastirmasi
- [ ] Batch estimation (tum populer modeller)
- [ ] Export cost report

## Detayli Adimlar

### 1. Cost Calculator Utilities

**Dosya:** `packages/core/src/models/cost-calculator.ts` (yeni)

```typescript
import type { FilteredModel, CostEstimate } from "./types";

export interface CostCalculationOptions {
  /** Input token count */
  inputTokens: number;
  /** Output ratio (0-1), default 0.1 */
  outputRatio?: number;
  /** Fixed output tokens (overrides ratio) */
  outputTokens?: number;
}

/**
 * Calculate cost for a single model
 */
export function calculateCost(model: FilteredModel, options: CostCalculationOptions): CostEstimate {
  const { inputTokens, outputRatio = 0.1, outputTokens } = options;

  const estimatedOutputTokens = outputTokens ?? Math.round(inputTokens * outputRatio);
  const inputCost = (inputTokens / 1_000_000) * model.inputCost;
  const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputCost;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    model,
    inputTokens,
    estimatedOutputTokens,
  };
}

/**
 * Calculate costs for multiple models
 */
export function calculateBatchCosts(
  models: FilteredModel[],
  options: CostCalculationOptions,
): CostEstimate[] {
  return models
    .map((model) => calculateCost(model, options))
    .sort((a, b) => a.totalCost - b.totalCost);
}

/**
 * Find cheapest model that fits context
 */
export function findCheapestModel(
  models: FilteredModel[],
  inputTokens: number,
): FilteredModel | null {
  const validModels = models.filter((m) => m.contextLimit >= inputTokens);
  if (validModels.length === 0) return null;

  return validModels.reduce((cheapest, current) =>
    current.inputCost < cheapest.inputCost ? current : cheapest,
  );
}

/**
 * Find models that fit context
 */
export function findFittingModels(models: FilteredModel[], inputTokens: number): FilteredModel[] {
  return models
    .filter((m) => m.contextLimit >= inputTokens)
    .sort((a, b) => a.inputCost - b.inputCost);
}

/**
 * Format cost as currency string
 */
export function formatCost(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
```

### 2. Cost Comparison Component

**Dosya:** `apps/web/src/components/cost-comparison.tsx` (yeni)

```tsx
import { useMemo, useState } from "react";
import { ArrowUpDown, Download, Info } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";

import type { FilteredModel, CostEstimate } from "@fileconcat/core";
import { calculateBatchCosts, formatCost } from "@fileconcat/core";

interface CostComparisonProps {
  models: FilteredModel[];
  inputTokens: number;
  outputRatio?: number;
}

type SortKey = "name" | "context" | "inputCost" | "outputCost" | "totalCost";
type SortOrder = "asc" | "desc";

export function CostComparison({ models, inputTokens, outputRatio = 0.1 }: CostComparisonProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const estimates = useMemo(() => {
    const results = calculateBatchCosts(models, { inputTokens, outputRatio });

    // Apply sorting
    return results.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortKey) {
        case "name":
          aVal = a.model.name;
          bVal = b.model.name;
          break;
        case "context":
          aVal = a.model.contextLimit;
          bVal = b.model.contextLimit;
          break;
        case "inputCost":
          aVal = a.inputCost;
          bVal = b.inputCost;
          break;
        case "outputCost":
          aVal = a.outputCost;
          bVal = b.outputCost;
          break;
        case "totalCost":
        default:
          aVal = a.totalCost;
          bVal = b.totalCost;
      }

      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }

      return sortOrder === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
  }, [models, inputTokens, outputRatio, sortKey, sortOrder]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const exportCsv = () => {
    const headers = [
      "Provider",
      "Model",
      "Context Limit",
      "Input Cost",
      "Output Cost",
      "Total Cost",
    ];
    const rows = estimates.map((e) => [
      e.model.providerName,
      e.model.name,
      e.model.contextLimit,
      formatCost(e.inputCost),
      formatCost(e.outputCost),
      formatCost(e.totalCost),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cost-comparison-${inputTokens}-tokens.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter to only show models that fit
  const fittingEstimates = estimates.filter((e) => e.model.contextLimit >= inputTokens);
  const overflowCount = estimates.length - fittingEstimates.length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Info className="mr-2 h-4 w-4" />
          Compare All Models
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cost Comparison</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div className="text-muted-foreground text-sm">
            {inputTokens.toLocaleString()} input tokens, {outputRatio * 100}% output ratio
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {overflowCount > 0 && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            {overflowCount} models excluded (context too small)
          </p>
        )}

        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("name")}>
                    Model
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("context")}>
                    Context
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("inputCost")}>
                    Input
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("outputCost")}>
                    Output
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("totalCost")}>
                    Total
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fittingEstimates.map((estimate, i) => (
                <TableRow key={estimate.model.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {i === 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          Cheapest
                        </Badge>
                      )}
                      <div>
                        <div className="font-medium">{estimate.model.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {estimate.model.providerName}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{(estimate.model.contextLimit / 1000).toFixed(0)}K</TableCell>
                  <TableCell>{formatCost(estimate.inputCost)}</TableCell>
                  <TableCell>{formatCost(estimate.outputCost)}</TableCell>
                  <TableCell className="font-medium">{formatCost(estimate.totalCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Token Section'a Entegrasyon

**Dosya:** `apps/web/src/components/token-section.tsx`

```tsx
import { CostComparison } from "~/components/cost-comparison";

// Render kisminda ekle
{
  tokens > 0 && (
    <div className="flex justify-end">
      <CostComparison models={models} inputTokens={tokens} outputRatio={0.1} />
    </div>
  );
}
```

### 4. Core Package Export

**Dosya:** `packages/core/src/models/index.ts`

```typescript
export {
  calculateCost,
  calculateBatchCosts,
  findCheapestModel,
  findFittingModels,
  formatCost,
} from "./cost-calculator";
```

## Test Etme

```bash
cd apps/web
pnpm dev

# Test checklist:
# [ ] "Compare All Models" butonu gozukuyor
# [ ] Dialog'da tum modeller listeleniyor
# [ ] Siralama calisiyor (her column)
# [ ] CSV export calisiyor
# [ ] Context overflow modeller filtreleniyor
# [ ] "Cheapest" badge dogru modelde
```

## Notlar

- Batch cost calculation client-side yapiliyor
- CSV export basit format, Excel'de acilabilir
- Context overflow modeller filtreleniyor ama sayisi gosteriliyor

## Rollback

```bash
rm packages/core/src/models/cost-calculator.ts
rm apps/web/src/components/cost-comparison.tsx
# token-section.tsx'ten CostComparison kaldir
```
