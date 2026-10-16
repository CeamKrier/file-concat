import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { CostEstimate } from "~/components/cost-estimate";
import { ModelSelector } from "~/components/model-selector";
import type { ModelPicker } from "~/hooks/use-selected-model";

import { recordOncePerRun } from "./files-pane";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: number;
  /** Owned by `app-flow` so the result screen can measure fit against it too. */
  modelPicker: ModelPicker;
};

/**
 * The model the result's token share and cost are measured against, opened
 * from the model name in the fit line. What goes in the bundle is the Files
 * pane's job now (`files-pane.tsx`).
 */
export function SettingsDrawer({ open, onOpenChange, tokens, modelPicker }: SettingsDrawerProps) {
  const { models, selectedModel, setSelectedModel, isLoading, lastUpdated, refresh } = modelPicker;
  // The Sheet is a modal dialog, so it scroll-locks the page via
  // react-remove-scroll. Popovers portal to document.body by default, escaping
  // that region, which kills wheel-scrolling inside them. Portal the model
  // picker into the sheet content instead. setState ref keeps this reactive and
  // stable across renders.
  const [sheetContainer, setSheetContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ref={setSheetContainer} aria-describedby="drawer-desc">
        <SheetHeader>
          <SheetTitle>Model</SheetTitle>
          <SheetDescription id="drawer-desc">
            The token share and the cost on the result are measured against this model.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="flex flex-col gap-3">
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              onSelect={(model) => {
                // Only a deliberate change is recorded - the default is set by
                // an effect that never comes through here, and counting it
                // would measure the default.
                //
                // The catalogue id prefix (`anthropic/claude-...`), not
                // `providerId`: the question is which vendor the hero and the
                // nine /for pages should aim at, which is who made the model
                // rather than who resells it cheapest. Model ids would be high
                // cardinality too, against a catalogue that refreshes from
                // models.dev on every build.
                recordOncePerRun("model_picked", model.uid.split("/")[0]);
                setSelectedModel(model);
              }}
              isLoading={isLoading}
              onRefresh={refresh}
              lastUpdated={lastUpdated}
              portalContainer={sheetContainer}
            />
            <CostEstimate model={selectedModel} inputTokens={tokens} />
          </div>
        </SheetBody>

        <SheetFooter>
          <p className="text-ink-muted text-xs">
            Prefer the terminal? The{" "}
            <Link to="/docs" className="text-go-fg hover:underline">
              CLI
            </Link>{" "}
            is a separate tool, not needed for this page.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
