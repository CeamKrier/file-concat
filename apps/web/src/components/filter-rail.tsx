import { useRef, useState } from "react";
import { ChevronDown, Download, RotateCcw, Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import type { SourceType, UserConfig } from "@fileconcat/core";
import { SOURCE_METADATA, getRemoteSourceTypes } from "@fileconcat/core";
import { cn } from "~/lib/utils";

const PATTERN_PRESETS = [
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
    ignore:
      "__pycache__, .venv, venv, .pytest_cache, dist, build, *.egg-info, **/*_test.py, **/test_*",
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
    name: "Java / Kotlin",
    include: "**/*.java, **/*.kt, **/*.gradle, **/*.xml, **/*.properties",
    ignore: "build, target, .gradle, **/test/**, **/*Test.java, **/*Test.kt",
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
] as const;

export interface FilterRailProps {
  config: UserConfig;
  setConfig: (updates: Partial<Omit<UserConfig, "version">>) => void;
  exportConfig: () => void;
  importConfig: (file: File) => Promise<void>;
  resetConfig: () => void;

  totalFiles: number;
  includedFiles: number;
  manualOverrideCount: number;
  onClearOverrides: () => void;

  className?: string;
  hasFiles: boolean;
}

export function FilterRail({
  config,
  setConfig,
  exportConfig,
  importConfig,
  resetConfig,
  totalFiles,
  includedFiles,
  manualOverrideCount,
  onClearOverrides,
  className,
  hasFiles,
}: FilterRailProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importConfig(file);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const applyPreset = (preset: (typeof PATTERN_PRESETS)[number]) => {
    setConfig({ includePatterns: preset.include, ignorePatterns: preset.ignore });
  };

  return (
    <aside
      className={cn(
        "flex flex-col gap-5 text-sm",
        className,
      )}
      aria-label="Filter and processing options"
    >
      <div className="space-y-2">
        <div className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
          Presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PATTERN_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="border-border/70 hover:border-foreground/40 hover:bg-accent focus-visible:ring-ring rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              title={`Include: ${preset.include}\nIgnore: ${preset.ignore}`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="includePatterns"
          className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]"
        >
          Include
        </Label>
        <textarea
          id="includePatterns"
          value={config.includePatterns}
          onChange={(e) => setConfig({ includePatterns: e.target.value })}
          placeholder="empty = all files"
          rows={2}
          spellCheck={false}
          className="bg-background border-border/70 focus-visible:border-foreground/40 focus-visible:ring-ring w-full resize-y rounded-md border px-2.5 py-1.5 font-mono text-[12px] leading-snug focus-visible:outline-none focus-visible:ring-2"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ignorePatterns"
          className="text-foreground text-[11px] font-semibold uppercase tracking-[0.08em]"
        >
          Ignore
        </Label>
        <textarea
          id="ignorePatterns"
          value={config.ignorePatterns}
          onChange={(e) => setConfig({ ignorePatterns: e.target.value })}
          placeholder="comma-separated globs"
          rows={3}
          spellCheck={false}
          className="bg-background border-border/70 focus-visible:border-foreground/40 focus-visible:ring-ring w-full resize-y rounded-md border px-2.5 py-1.5 font-mono text-[12px] leading-snug focus-visible:outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Comma-separated globs. Pattern changes update the file tree live.{" "}
          <a
            href="https://github.com/isaacs/node-glob#glob-primer"
            target="_blank"
            rel="noopener"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            syntax
          </a>
        </p>
      </div>

      {hasFiles && (
        <div className="border-border/60 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-3 font-mono text-[11.5px]">
          <span className="text-foreground">
            <span className="font-semibold tabular-nums">{includedFiles.toLocaleString()}</span>
            <span className="text-muted-foreground"> of </span>
            <span className="tabular-nums">{totalFiles.toLocaleString()}</span>
            <span className="text-muted-foreground"> included</span>
          </span>
          {manualOverrideCount > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground tabular-nums">
                {manualOverrideCount} manual
              </span>
              <button
                type="button"
                onClick={onClearOverrides}
                aria-label="Clear manual file overrides"
                className="text-muted-foreground hover:text-foreground focus-visible:text-foreground underline underline-offset-2 transition-colors focus-visible:outline-none"
              >
                clear
              </button>
            </>
          )}
        </div>
      )}

      <details className="border-border/60 group border-t pt-3">
        <summary className="text-foreground hover:text-foreground/80 flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] focus-visible:outline-none">
          Advanced
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-4 space-y-4">
          <label className="text-foreground flex cursor-pointer items-start gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={config.showLineNumbers}
              onChange={(e) => setConfig({ showLineNumbers: e.target.checked })}
              className="accent-foreground mt-0.5 rounded"
            />
            <span className="flex flex-col gap-0.5">
              <span>Show line numbers</span>
              <span className="text-muted-foreground text-[10.5px] leading-tight">
                Adds a column prefix. Increases token count by roughly 40 to 50 percent.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label
              htmlFor="maxFileSize"
              className="text-muted-foreground text-[11.5px] font-normal"
            >
              Max file size (MB)
            </Label>
            <input
              id="maxFileSize"
              type="number"
              min={1}
              max={100}
              value={config.maxFileSizeMB}
              onChange={(e) => setConfig({ maxFileSizeMB: Number(e.target.value) })}
              className="bg-background border-border/70 focus-visible:border-foreground/40 focus-visible:ring-ring w-full max-w-[8rem] rounded-md border px-2.5 py-1 font-mono text-[12px] tabular-nums focus-visible:outline-none focus-visible:ring-2"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11.5px] font-normal">
              Default remote source
            </Label>
            <div className="flex flex-wrap gap-1">
              {getRemoteSourceTypes().map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setConfig({ defaultSourceType: type as SourceType })}
                  aria-pressed={config.defaultSourceType === type}
                  className={cn(
                    "border-border/70 hover:border-foreground/40 rounded-md border px-2 py-0.5 text-[11.5px] transition-colors",
                    config.defaultSourceType === type
                      ? "bg-foreground text-background border-foreground"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  {SOURCE_METADATA[type].name}
                </button>
              ))}
            </div>
            <label className="text-foreground flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={config.autoSwitchSource}
                onChange={(e) => setConfig({ autoSwitchSource: e.target.checked })}
                className="accent-foreground rounded"
              />
              Auto-switch on paste
            </label>
          </div>

          {importError && (
            <div className="text-destructive text-[11.5px]">{importError}</div>
          )}

          <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11.5px]"
              onClick={exportConfig}
            >
              <Download className="h-3 w-3" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11.5px]"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-[11.5px]"
              onClick={resetConfig}
            >
              <RotateCcw className="h-3 w-3" />
              Reset settings
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>
      </details>
    </aside>
  );
}
