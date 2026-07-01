import { useState, useEffect, useCallback } from "react";
import type { OutputFormatPreference, UserConfig } from "@fileconcat/core";
import { CONFIG_VERSION, DEFAULT_IGNORE_STRING } from "@fileconcat/core";

const STORAGE_KEY = "fileconcat-config";

const DEFAULT_CONFIG: UserConfig = {
  version: CONFIG_VERSION,
  maxFileSizeMB: 32,
  includePatterns: "",
  ignorePatterns: DEFAULT_IGNORE_STRING,
  showLineNumbers: false,
  defaultOutputFormat: "auto",
  outputStyle: "xml",
  chunkSizeKB: 32,
};

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value as string) ? (value as T) : fallback;
}

function pickIgnorePatterns(raw: Record<string, unknown>): string {
  // V3-era schema stored ignore patterns as a string array under
  // `customIgnorePatterns`. Newer schemas use a comma-separated string at
  // `ignorePatterns`. Honour either, falling back to defaults.
  if (Array.isArray(raw.customIgnorePatterns)) return raw.customIgnorePatterns.join(", ");
  return pickString(raw.ignorePatterns, DEFAULT_IGNORE_STRING);
}

const OUTPUT_STYLES = ["xml", "markdown"] as const;
const OUTPUT_FORMAT_PREFS = ["auto", "single", "multi"] as const;

function pickOutputFormatPref(raw: Record<string, unknown>): OutputFormatPreference {
  // `defaultOutputFormat` existed before v6 but was never wired to the UI — the
  // app drove the format off the live token recommendation, so a stored
  // "single" / "multi" from a pre-v6 schema is a dead default, not a deliberate
  // user choice. Only honour it once the config is already on v6+, where the
  // preference is real; otherwise start fresh at "auto".
  const storedVersion = typeof raw.version === "number" ? raw.version : 0;
  if (storedVersion >= 6) {
    return pickEnum(raw.defaultOutputFormat, OUTPUT_FORMAT_PREFS, "auto");
  }
  return "auto";
}

function migrateConfig(oldConfig: Record<string, unknown>): UserConfig {
  return {
    version: CONFIG_VERSION,
    maxFileSizeMB: pickNumber(oldConfig.maxFileSizeMB, DEFAULT_CONFIG.maxFileSizeMB),
    includePatterns: pickString(oldConfig.includePatterns, DEFAULT_CONFIG.includePatterns),
    ignorePatterns: pickIgnorePatterns(oldConfig),
    showLineNumbers: pickBoolean(oldConfig.showLineNumbers, DEFAULT_CONFIG.showLineNumbers),
    defaultOutputFormat: pickOutputFormatPref(oldConfig),
    outputStyle: pickEnum(oldConfig.outputStyle, OUTPUT_STYLES, DEFAULT_CONFIG.outputStyle),
    chunkSizeKB: pickNumber(oldConfig.chunkSizeKB, DEFAULT_CONFIG.chunkSizeKB),
  };
}

/**
 * Hook for persisting user configuration to localStorage
 */
export function useConfig() {
  const [config, setConfigState] = useState<UserConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.version === CONFIG_VERSION) {
          setConfigState(parsed as UserConfig);
        } else {
          // Migrate from older version
          const migrated = migrateConfig(parsed);
          setConfigState(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      }
    } catch (error) {
      console.warn("Failed to load config from localStorage:", error);
    }
    setIsLoaded(true);
  }, []);

  // Save config to localStorage whenever it changes
  const setConfig = useCallback((updates: Partial<Omit<UserConfig, "version">>) => {
    setConfigState((prev) => {
      const newConfig = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      } catch (error) {
        console.warn("Failed to save config to localStorage:", error);
      }
      return newConfig;
    });
  }, []);

  // Reset to defaults
  const resetConfig = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
    } catch (error) {
      console.warn("Failed to reset config:", error);
    }
  }, []);

  return {
    config,
    setConfig,
    resetConfig,
    isLoaded,
    DEFAULT_CONFIG,
  };
}
