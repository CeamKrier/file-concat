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
    if (model.inputCost === 0 && model.outputCost === 0) return null;

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

  if (!model) {
    return null;
  }

  if (!estimate) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <DollarSign className="text-muted-foreground h-4 w-4" />
        <span className="font-medium">Pricing unavailable</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <Info className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-2 text-sm">
              <h4 className="font-medium">Pricing Unavailable</h4>
              <p className="text-muted-foreground">
                This model does not include pricing data in the registry, so cost estimation is
                skipped.
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input tokens:</span>
                <span>{inputTokens.toLocaleString()}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
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
