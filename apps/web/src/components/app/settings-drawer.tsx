import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { FileStatus, FilteredModel, UserConfig } from "@fileconcat/core";

import FileTree from "~/components/file-tree";
import { CostEstimate } from "~/components/cost-estimate";
import { ModelSelector } from "~/components/model-selector";
import { useModels } from "~/hooks/use-models";
import { cn } from "~/lib/utils";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";

type Preset = { name: string; include: string; ignore: string };

// Mirrors the redesign's quick presets. Applying one rewrites the include /
// ignore globs; the bundle (tree, counts, tokens) updates live.
const PRESETS: Preset[] = [
  {
    name: "React / Next",
    include: "**/*.tsx, **/*.ts, **/*.jsx, **/*.js, **/*.css, **/*.json",
    ignore: "node_modules, .next, dist, build, coverage, **/*.test.*, **/*.spec.*, **/__tests__",
  },
  {
    name: "Vue",
    include: "**/*.vue, **/*.ts, **/*.js, **/*.css, **/*.json",
    ignore: "node_modules, dist, .nuxt, coverage, **/*.test.*, **/*.spec.*",
  },
  {
    name: "Python",
    include: "**/*.py, **/*.pyi, **/*.toml, **/*.yaml, **/*.yml, **/*.json",
    ignore: "__pycache__, .venv, venv, .pytest_cache, dist, build, *.egg-info, **/*_test.py",
  },
  {
    name: "Go",
    include: "**/*.go, **/*.mod, **/*.sum, **/*.yaml, **/*.yml",
    ignore: "vendor, bin, **/*_test.go",
  },
  {
    name: "Rust",
    include: "**/*.rs, **/*.toml, **/*.md",
    ignore: "target, **/*_test.rs",
  },
  {
    name: "Source only",
    include: "src/**/*",
    ignore: "**/*.test.*, **/*.spec.*, **/__tests__",
  },
  {
    name: "Docs only",
    include: "**/*.md, **/*.mdx, **/*.txt, **/*.rst, docs/**/*",
    ignore: "node_modules, .git",
  },
];

type SettingsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: UserConfig;
  setConfig: (updates: Partial<Omit<UserConfig, "version">>) => void;
  fileStatuses: FileStatus[];
  onToggleFile: (index: number) => void;
  onToggleMultipleFiles: (indices: number[], shouldInclude: boolean) => void;
  includedFileCount: number;
  tokens: number;
};

export function SettingsDrawer({
  open,
  onOpenChange,
  config,
  setConfig,
  fileStatuses,
  onToggleFile,
  onToggleMultipleFiles,
  includedFileCount,
  tokens,
}: SettingsDrawerProps) {
  const { models, isLoading, lastUpdated, refresh } = useModels();
  const [selectedModel, setSelectedModel] = useState<FilteredModel | null>(null);

  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    const preferred = models.find((m) => m.name.toLowerCase().includes("sonnet")) ?? models[0];
    setSelectedModel(preferred);
  }, [models, selectedModel]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="drawer-desc">
        <SheetHeader>
          <SheetTitle>Fine-tune the output</SheetTitle>
          <SheetDescription id="drawer-desc">
            Everything updates live. You don&apos;t have to touch any of this.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="flex flex-col gap-6">
            <Section label="Quick presets">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const active =
                    config.includePatterns === preset.include &&
                    config.ignorePatterns === preset.ignore;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setConfig({
                          includePatterns: preset.include,
                          ignorePatterns: preset.ignore,
                        })
                      }
                      className={cn(
                        "rounded-chip focus-visible:ring-ring focus-visible:ring-offset-surface-alt border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                        active
                          ? "border-primary text-go-fg bg-[oklch(var(--primary)/0.12)]"
                          : "border-border bg-surface text-ink-secondary hover:text-ink hover:border-border-strong",
                      )}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              label="Ignore"
              hint="node_modules, lockfiles & binaries are skipped automatically."
            >
              <PatternArea
                value={config.ignorePatterns}
                onChange={(v) => setConfig({ ignorePatterns: v })}
                rows={3}
                placeholder=".git, node_modules, dist, *.lock"
              />
            </Section>

            <Section label="Only include" hint="Empty = everything readable.">
              <PatternArea
                value={config.includePatterns}
                onChange={(v) => setConfig({ includePatterns: v })}
                rows={2}
                placeholder="src/**/*, **/*.md"
              />
            </Section>

            <Section label={`Files · ${includedFileCount} in`}>
              <div className="border-border bg-surface rounded-card max-h-[300px] overflow-y-auto border p-1.5">
                <FileTree
                  fileStatuses={fileStatuses}
                  onToggleFile={onToggleFile}
                  onToggleMultipleFiles={onToggleMultipleFiles}
                  embedded
                />
              </div>
            </Section>

            <Section label="Cost estimate">
              <div className="flex flex-col gap-3">
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={setSelectedModel}
                  isLoading={isLoading}
                  onRefresh={refresh}
                  lastUpdated={lastUpdated}
                />
                <CostEstimate model={selectedModel} inputTokens={tokens} />
              </div>
            </Section>
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

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-ink-faint mb-2 font-mono text-[11px] uppercase tracking-[0.12em]">
        {label}
      </h3>
      {children}
      {hint && <p className="text-ink-muted mt-1.5 text-[11px]">{hint}</p>}
    </section>
  );
}

function PatternArea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      spellCheck={false}
      className="border-border bg-surface-inset text-code focus-visible:ring-ring focus-visible:border-border-strong rounded-input w-full resize-none border px-3 py-2 font-mono text-xs leading-relaxed placeholder:text-[oklch(var(--text-faint))] focus-visible:outline-none focus-visible:ring-1"
    />
  );
}
