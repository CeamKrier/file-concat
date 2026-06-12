import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG_VERSION, DEFAULT_IGNORE_STRING } from "@fileconcat/core";
import { useConfig } from "~/hooks/use-config";

const STORAGE_KEY = "fileconcat-config";

const baseV5Fields = {
  maxFileSizeMB: 32,
  includePatterns: "",
  ignorePatterns: DEFAULT_IGNORE_STRING,
  showLineNumbers: false,
  defaultOutputFormat: "single" as const,
  outputStyle: "xml" as const,
  autoSwitchSource: false,
  defaultSourceType: "github" as const,
};

describe("useConfig localStorage migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts a v5 payload as-is without migration", async () => {
    const stored = { version: CONFIG_VERSION, ...baseV5Fields, maxFileSizeMB: 64 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.config.version).toBe(CONFIG_VERSION);
    expect(result.current.config.maxFileSizeMB).toBe(64);
    // The hook returns the stored object verbatim — no rewrite to localStorage.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual(stored);
  });

  it("drops legacy removeEmptyLines when migrating from v4", async () => {
    const v4 = {
      version: 4,
      ...baseV5Fields,
      removeEmptyLines: true,
      showLineNumbers: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v4));

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.config.version).toBe(CONFIG_VERSION);
    expect(result.current.config.showLineNumbers).toBe(true);
    expect(result.current.config).not.toHaveProperty("removeEmptyLines");

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(persisted.version).toBe(CONFIG_VERSION);
    expect(persisted).not.toHaveProperty("removeEmptyLines");
  });

  it("rolls v3 customIgnorePatterns string[] into the v5 ignorePatterns string", async () => {
    const v3 = {
      version: 3,
      maxFileSizeMB: 32,
      includePatterns: "",
      customIgnorePatterns: ["node_modules", "dist", ".cache"],
      showLineNumbers: false,
      defaultOutputFormat: "single",
      outputStyle: "xml",
      autoSwitchSource: false,
      defaultSourceType: "github",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v3));

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.config.version).toBe(CONFIG_VERSION);
    expect(result.current.config.ignorePatterns).toBe("node_modules, dist, .cache");
    expect(result.current.config).not.toHaveProperty("customIgnorePatterns");
  });

  it("treats an unknown version as legacy and runs migration with defaults", async () => {
    const futureShape = { version: 99, somethingNew: "ignored" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(futureShape));

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.config.version).toBe(CONFIG_VERSION);
    expect(result.current.config.maxFileSizeMB).toBe(32);
    expect(result.current.config.ignorePatterns).toBe(DEFAULT_IGNORE_STRING);
    expect(result.current.config).not.toHaveProperty("somethingNew");
  });

  it("falls back to defaults when localStorage holds malformed JSON", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.config.version).toBe(CONFIG_VERSION);
    expect(result.current.config.maxFileSizeMB).toBe(32);
    expect(result.current.config.ignorePatterns).toBe(DEFAULT_IGNORE_STRING);
  });

  it("persists the migrated config back to localStorage so the next load skips migration", async () => {
    const v4 = { version: 4, ...baseV5Fields, removeEmptyLines: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v4));

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(persisted.version).toBe(CONFIG_VERSION);
    expect(persisted).not.toHaveProperty("removeEmptyLines");
  });
});
