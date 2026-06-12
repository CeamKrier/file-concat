import * as fs from "node:fs";
import * as path from "node:path";
import type { OutputStyle } from "@fileconcat/core";

export interface FileConcatConfig {
  version?: number;
  maxFileSizeMB?: number;
  excludeHiddenFiles?: boolean;
  excludeBinaryFiles?: boolean;
  exclude?: string[];
  output?: string;
  style?: OutputStyle;
}

interface ConfigLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

const DEFAULT_CONFIG: FileConcatConfig = {
  version: 1,
  maxFileSizeMB: 32,
  excludeHiddenFiles: true,
  excludeBinaryFiles: true,
  exclude: [],
};

const CONFIG_FILES = [".fileconcatrc", ".fileconcatrc.json", "fileconcat.config.json"];

const SILENT_LOGGER: ConfigLogger = {
  info: () => {},
  warn: (msg) => process.stderr.write(msg + "\n"),
};

/**
 * Load config from .fileconcatrc or specified file. All log lines are routed
 * through the provided logger so stdout stays clean for piped output.
 */
export function loadConfig(
  configPath?: string,
  basePath: string = ".",
  log: ConfigLogger = SILENT_LOGGER,
): FileConcatConfig {
  if (configPath) {
    const fullPath = path.resolve(basePath, configPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      } catch {
        log.warn(`Warning: Could not parse config file ${configPath}`);
      }
    }
  }

  for (const configFile of CONFIG_FILES) {
    const fullPath = path.resolve(basePath, configFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        log.info(`Using config from ${configFile}`);
        return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      } catch {
        // skip invalid files silently
      }
    }
  }

  return DEFAULT_CONFIG;
}
