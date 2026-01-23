import { useRef, useState } from "react";
import {
  Settings,
  Download,
  Upload,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { UserConfig } from "@fileconcat/core";

// Stack-based pattern presets
const PATTERN_PRESETS = [
  {
    name: "React/Next.js",
    icon: "⚛️",
    include: "**/*.tsx, **/*.ts, **/*.jsx, **/*.js, **/*.css, **/*.json",
    ignore: "node_modules, .next, dist, build, coverage, **/*.test.*, **/*.spec.*, **/__tests__",
  },
  {
    name: "Vue.js",
    icon: "💚",
    include: "**/*.vue, **/*.ts, **/*.js, **/*.css, **/*.json",
    ignore: "node_modules, dist, .nuxt, coverage, **/*.test.*, **/*.spec.*",
  },
  {
    name: "Python",
    icon: "🐍",
    include: "**/*.py, **/*.pyi, **/*.toml, **/*.yaml, **/*.yml, **/*.json",
    ignore:
      "__pycache__, .venv, venv, .pytest_cache, dist, build, *.egg-info, **/*_test.py, **/test_*",
  },
  {
    name: "Go",
    icon: "🐹",
    include: "**/*.go, **/*.mod, **/*.sum, **/*.yaml, **/*.yml",
    ignore: "vendor, bin, **/*_test.go",
  },
  {
    name: "Rust",
    icon: "🦀",
    include: "**/*.rs, **/*.toml, **/*.md",
    ignore: "target, **/*_test.rs",
  },
  {
    name: "Java/Kotlin",
    icon: "☕",
    include: "**/*.java, **/*.kt, **/*.gradle, **/*.xml, **/*.properties",
    ignore: "build, target, .gradle, **/test/**, **/*Test.java, **/*Test.kt",
  },
  {
    name: "Source Only",
    icon: "📁",
    include: "src/**/*",
    ignore: "**/*.test.*, **/*.spec.*, **/__tests__",
  },
  {
    name: "Docs Only",
    icon: "📝",
    include: "**/*.md, **/*.mdx, **/*.txt, **/*.rst, docs/**/*",
    ignore: "node_modules, .git",
  },
] as const;

interface ConfigPanelProps {
  config: UserConfig;
  setConfig: (updates: Partial<Omit<UserConfig, "version">>) => void;
  exportConfig: () => void;
  importConfig: (file: File) => Promise<void>;
  resetConfig: () => void;
}

export default function ConfigPanel({
  config,
  setConfig,
  exportConfig,
  importConfig,
  resetConfig,
}: ConfigPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importConfig(file);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="cursor-pointer py-3" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <CardTitle className="text-base">Settings</CardTitle>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-5 pt-0">
          {/* Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-yellow-500" />
              <Label>Quick Presets</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {PATTERN_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setConfig({
                      includePatterns: preset.include,
                      ignorePatterns: preset.ignore,
                    });
                  }}
                  title={`Include: ${preset.include}\nIgnore: ${preset.ignore}`}
                >
                  <span className="mr-1">{preset.icon}</span>
                  {preset.name}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Click a preset to auto-fill include/ignore patterns for common stacks.
            </p>
          </div>

          {/* Include Patterns */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="includePatterns">Include Patterns</Label>
              <a
                href="https://github.com/isaacs/node-glob#glob-primer"
                target="_blank"
                rel="noopener"
                className="text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-3 w-3" />
              </a>
            </div>
            <textarea
              id="includePatterns"
              value={config.includePatterns}
              onChange={(e) => setConfig({ includePatterns: e.target.value })}
              placeholder="e.g., src/**/*.ts, src/**/*.tsx"
              className="bg-background min-h-[60px] w-full resize-y rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated glob patterns. Leave empty to include all files.
            </p>
          </div>

          {/* Ignore Patterns */}
          <div className="space-y-2">
            <Label htmlFor="ignorePatterns">Ignore Patterns</Label>
            <textarea
              id="ignorePatterns"
              value={config.ignorePatterns}
              onChange={(e) => setConfig({ ignorePatterns: e.target.value })}
              placeholder="e.g., node_modules, dist, *.test.ts"
              className="bg-background min-h-[60px] w-full resize-y rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated patterns to exclude from output.
            </p>
          </div>

          {/* File Processing Options */}
          <div className="space-y-3">
            <Label>File Processing</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.removeEmptyLines}
                  onChange={(e) => setConfig({ removeEmptyLines: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Remove Empty Lines</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.showLineNumbers}
                  onChange={(e) => setConfig({ showLineNumbers: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Show Line Numbers</span>
              </label>
            </div>
          </div>

          {/* Max File Size */}
          <div className="space-y-2">
            <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
            <input
              id="maxFileSize"
              type="number"
              min={1}
              max={100}
              value={config.maxFileSizeMB}
              onChange={(e) => setConfig({ maxFileSizeMB: Number(e.target.value) })}
              className="bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* Default Output Format */}
          <div className="space-y-2">
            <Label>Default Output Format</Label>
            <div className="flex gap-2">
              <Button
                variant={config.defaultOutputFormat === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ defaultOutputFormat: "single" })}
              >
                Single File
              </Button>
              <Button
                variant={config.defaultOutputFormat === "multi" ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ defaultOutputFormat: "multi" })}
              >
                Multiple Files
              </Button>
            </div>
          </div>

          {/* Import Error */}
          {importError && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {importError}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={exportConfig}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>

            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={resetConfig}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
