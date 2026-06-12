import { useState, useEffect, useCallback } from "react";
import type { SourceType } from "@fileconcat/core";

const STORAGE_KEY = "fileconcat-recent-sources";
const MAX_RECENT = 10;
const RECENT_SOURCES_VERSION = 1;

export interface RecentSource {
  /** Source URL */
  url: string;
  /** Source type */
  type: SourceType;
  /** Display name (repo name, gist id, etc.) */
  name: string;
  /** Timestamp */
  timestamp: number;
}

interface StoredEnvelope {
  version: number;
  sources: RecentSource[];
}

/**
 * Read the stored payload, accepting either the current envelope shape
 * or the legacy bare-array shape that predates versioning. Filtering /
 * sorting / capping happens at the call site.
 */
function readStoredSources(raw: string): RecentSource[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const envelope = parsed as Partial<StoredEnvelope>;
      if (Array.isArray(envelope.sources)) return envelope.sources;
    }
    if (Array.isArray(parsed)) return parsed as RecentSource[];
  } catch {
    // fall through to empty
  }
  return [];
}

interface UseRecentSourcesReturn {
  /** Recent sources list */
  sources: RecentSource[];
  /** Add a source to history */
  add: (source: Omit<RecentSource, "timestamp">) => void;
  /** Remove a source from history */
  remove: (url: string) => void;
  /** Clear all history */
  clear: () => void;
}

/**
 * Extract display name from URL
 */
function extractName(url: string, type: SourceType): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    switch (type) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        // Extract owner/repo
        const parts = path.split("/").filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0]}/${parts[1]}`;
        }
        return parts[0] || url;
      }
      case "gist": {
        // Extract gist id
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1]?.substring(0, 8) || "gist";
      }
      case "url": {
        // Use hostname + filename
        const filename = path.split("/").pop() || "";
        return filename || urlObj.hostname;
      }
      default:
        return url;
    }
  } catch {
    return url.substring(0, 30);
  }
}

export function useRecentSources(): UseRecentSourcesReturn {
  const [sources, setSources] = useState<RecentSource[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const valid = readStoredSources(stored)
          .filter((s) => s.url && s.type && s.timestamp)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RECENT);
        setSources(valid);
      }
    } catch (e) {
      console.warn("Failed to load recent sources:", e);
    }
  }, []);

  // Save to localStorage
  const save = useCallback((newSources: RecentSource[]) => {
    try {
      const envelope: StoredEnvelope = {
        version: RECENT_SOURCES_VERSION,
        sources: newSources,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (e) {
      console.warn("Failed to save recent sources:", e);
    }
  }, []);

  const add = useCallback(
    (source: Omit<RecentSource, "timestamp">) => {
      setSources((prev) => {
        // Remove existing entry with same URL
        const filtered = prev.filter((s) => s.url !== source.url);

        // Add new entry at the beginning
        const newSource: RecentSource = {
          ...source,
          name: source.name || extractName(source.url, source.type),
          timestamp: Date.now(),
        };

        const newSources = [newSource, ...filtered].slice(0, MAX_RECENT);
        save(newSources);
        return newSources;
      });
    },
    [save],
  );

  const remove = useCallback(
    (url: string) => {
      setSources((prev) => {
        const newSources = prev.filter((s) => s.url !== url);
        save(newSources);
        return newSources;
      });
    },
    [save],
  );

  const clear = useCallback(() => {
    setSources([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear recent sources:", e);
    }
  }, []);

  return {
    sources,
    add,
    remove,
    clear,
  };
}
