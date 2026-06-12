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
import Badge from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";

import type { CostEstimate, FilteredModel } from "@fileconcat/core";
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

  const estimates = useMemo<CostEstimate[]>(() => {
    const results = calculateBatchCosts(models, { inputTokens, outputRatio });

    return results.sort((a: CostEstimate, b: CostEstimate) => {
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

  const fittingEstimates = estimates.filter(
    (e: CostEstimate) => e.model.contextLimit >= inputTokens,
  );
  const overflowCount = estimates.length - fittingEstimates.length;
  const cheapestUid = fittingEstimates.reduce<string | null>((current, estimate) => {
    if (!current) return estimate.model.uid;
    const currentEstimate = fittingEstimates.find((e) => e.model.uid === current);
    if (!currentEstimate) return estimate.model.uid;
    return estimate.totalCost < currentEstimate.totalCost ? estimate.model.uid : current;
  }, null);

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
              {fittingEstimates.map((estimate) => (
                <TableRow key={estimate.model.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {cheapestUid === estimate.model.uid && (
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
