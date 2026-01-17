import { useState, useEffect, useCallback } from "react";
import type { UserConfig } from "@fileconcat/core";
import { DEFAULT_IGNORE_STRING } from "@fileconcat/core";

const STORAGE_KEY = "fileconcat-config";
const CURRENT_VERSION = 2;

const DEFAULT_CONFIG: UserConfig = {
  version: 2,
  maxFileSizeMB: 32,
  includePatterns: "",
  ignorePatterns: DEFAULT_IGNORE_STRING,
  removeEmptyLines: false,
  showLineNumbers: false,
  defaultOutputFormat: "single",
};

// Migration from v1 to v2
function migrateConfig(oldConfig: Record<string, unknown>): UserConfig {
  return {
    ...DEFAULT_CONFIG,
    maxFileSizeMB: (oldConfig.maxFileSizeMB as number) || DEFAULT_CONFIG.maxFileSizeMB,
    defaultOutputFormat: (oldConfig.defaultOutputFormat as "single" | "multi") || DEFAULT_CONFIG.defaultOutputFormat,
    // Convert old customIgnorePatterns array to string if exists, otherwise use defaults
    ignorePatterns: Array.isArray(oldConfig.customIgnorePatterns)
      ? oldConfig.customIgnorePatterns.join(", ")
      : DEFAULT_IGNORE_STRING,
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
        if (parsed.version === CURRENT_VERSION) {
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

  // Export config as JSON file
  const exportConfig = useCallback(() => {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fileconcat-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [config]);

  // Import config from JSON file
  const importConfig = useCallback((file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          const migrated = imported.version === CURRENT_VERSION
            ? imported as UserConfig
            : migrateConfig(imported);
          setConfigState(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          resolve();
        } catch (error) {
          reject(new Error("Failed to parse config file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
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
    exportConfig,
    importConfig,
    resetConfig,
    isLoaded,
    DEFAULT_CONFIG,
  };
}
