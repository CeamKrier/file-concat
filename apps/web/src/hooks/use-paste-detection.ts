import { useEffect, useCallback } from "react";
import type { SourceType } from "@fileconcat/core";
import { defaultSourceRegistry } from "@fileconcat/core";

interface UsePasteDetectionOptions {
  /** Enable paste detection */
  enabled?: boolean;
  /** Callback when URL is pasted */
  onPaste?: (url: string, detectedType: SourceType | null) => void;
}

/**
 * Hook to detect URL paste events globally
 */
export function usePasteDetection(options: UsePasteDetectionOptions = {}) {
  const { enabled = true, onPaste } = options;

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName?.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
          return;
        }
      }

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      // Check if it looks like a URL
      if (!text.startsWith("http://") && !text.startsWith("https://")) {
        return;
      }

      // Detect source type
      const detectedType = defaultSourceRegistry.detectType(text);
      onPaste?.(text, detectedType || null);
    },
    [enabled, onPaste],
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [enabled, handlePaste]);
}
