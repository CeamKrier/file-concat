import * as fs from "node:fs";
import * as path from "node:path";

export interface FileConcatConfig {
  version?: number;
  maxFileSizeMB?: number;
  excludeHiddenFiles?: boolean;
  excludeBinaryFiles?: boolean;
  exclude?: string[];
  output?: string;
  xmlFormat?: boolean;
}

const DEFAULT_CONFIG: FileConcatConfig = {
  version: 1,
  maxFileSizeMB: 32,
  excludeHiddenFiles: true,
  excludeBinaryFiles: true,
  exclude: [],
};

const CONFIG_FILES = [".fileconcatrc", ".fileconcatrc.json", "fileconcat.config.json"];

/**
 * Load config from .fileconcatrc or specified file
 */
export function loadConfig(configPath?: string, basePath: string = "."): FileConcatConfig {
  // If specific config path provided
  if (configPath) {
    const fullPath = path.resolve(basePath, configPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      } catch (error) {
        console.warn(`Warning: Could not parse config file ${configPath}`);
      }
    }
  }

  // Search for default config files
  for (const configFile of CONFIG_FILES) {
    const fullPath = path.resolve(basePath, configFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        console.log(`Using config from ${configFile}`);
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      } catch (error) {
        // Skip invalid files
      }
    }
  }

  return DEFAULT_CONFIG;
}
