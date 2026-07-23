import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DEFAULT_IGNORE_STRING } from "@fileconcat/core";
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
type PresetGroup = { label: string; presets: Preset[] };

// Grouped quick presets. Applying one rewrites the include / ignore globs; the
// bundle (tree, counts, tokens) updates live. The groups are static and shown to
// everyone — the labels themselves do the persona differentiation, so a
// non-developer sees a clearly-labelled "Documents" set instead of a wall of
// framework chips, without any persona-detection logic in the surface.
const PRESET_GROUPS: PresetGroup[] = [
  {
    label: "General",
    presets: [
      // Resets to the honest default state: no include filter, standard noise
      // still skipped. Matches the initial config, so it reads as active on load.
      { name: "Everything readable", include: "", ignore: DEFAULT_IGNORE_STRING },
      {
        name: "Source only",
        include: "src/**/*",
        ignore: "**/*.test.*, **/*.spec.*, **/__tests__",
      },
    ],
  },
  {
    label: "Code stacks",
    presets: [
      {
        name: "React / Next",
        include: "**/*.tsx, **/*.ts, **/*.jsx, **/*.js, **/*.css, **/*.json",
        ignore:
          "node_modules, .next, dist, build, coverage, **/*.test.*, **/*.spec.*, **/__tests__",
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
    ],
  },
  {
    label: "Documents",
    presets: [
      {
        name: "Documents",
        include: "**/*.pdf, **/*.docx, **/*.xlsx, **/*.pptx, **/*.odt, **/*.md, **/*.txt, **/*.rtf",
        ignore: DEFAULT_IGNORE_STRING,
      },
      {
        name: "Notes (markdown & text)",
        include: "**/*.md, **/*.mdx, **/*.txt, **/*.rst",
        ignore: DEFAULT_IGNORE_STRING,
      },
      {
        name: "Papers (PDF)",
        include: "**/*.pdf",
        ignore: DEFAULT_IGNORE_STRING,
      },
    ],
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
  // The Sheet is a modal dialog, so it scroll-locks the page via
  // react-remove-scroll. Popovers portal to document.body by default, escaping
  // that region, which kills wheel-scrolling inside them. Portal the model
  // picker into the sheet content instead. setState ref keeps this reactive and
  // stable across renders.
  const [sheetContainer, setSheetContainer] = useState<HTMLDivElement | null>(null);
  // Pattern textareas are a developer tool — collapsed by default so a regular
  // user only meets the file tree. Programmers open this when they want globs.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (selectedModel || models.length === 0) return;
    const preferred = models.find((m) => m.name.toLowerCase().includes("sonnet")) ?? models[0];
    setSelectedModel(preferred);
  }, [models, selectedModel]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ref={setSheetContainer} aria-describedby="drawer-desc">
        <SheetHeader>
          <SheetTitle>Fine-tune the output</SheetTitle>
          <SheetDescription id="drawer-desc">
            Everything updates live. You don&apos;t have to touch any of this.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="flex flex-col gap-6">
            <Section label="Quick presets">
              <div className="flex flex-col gap-3">
                {PRESET_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-ink-faint mb-1.5 text-[11px]">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.presets.map((preset) => {
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
                  </div>
                ))}
              </div>
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

            <div>
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                className="text-ink-faint hover:text-ink-secondary flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors"
              >
                {advancedOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Advanced · ignore &amp; include patterns
              </button>
              {advancedOpen && (
                <div className="mt-3 flex flex-col gap-4">
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
                </div>
              )}
            </div>

            <Section label="Cost estimate">
              <div className="flex flex-col gap-3">
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={setSelectedModel}
                  isLoading={isLoading}
                  onRefresh={refresh}
                  lastUpdated={lastUpdated}
                  portalContainer={sheetContainer}
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
