import { useState, useCallback } from "react";
import type { SourceType, ParsedSourceUrl } from "@fileconcat/core";
import { defaultSourceRegistry } from "@fileconcat/core";

interface UseSourceDetectionOptions {
  /** Callback when source is detected */
  onDetect?: (type: SourceType, parsed: ParsedSourceUrl) => void;
}

interface UseSourceDetectionReturn {
  /** Detected source type */
  detectedType: SourceType | null;
  /** Parsed URL info */
  parsedUrl: ParsedSourceUrl | null;
  /** Detect source from URL */
  detect: (url: string) => SourceType | null;
  /** Clear detection */
  clear: () => void;
}

export function useSourceDetection(
  options: UseSourceDetectionOptions = {},
): UseSourceDetectionReturn {
  const { onDetect } = options;
  const [detectedType, setDetectedType] = useState<SourceType | null>(null);
  const [parsedUrl, setParsedUrl] = useState<ParsedSourceUrl | null>(null);

  const detect = useCallback(
    (url: string): SourceType | null => {
      if (!url.trim()) {
        setDetectedType(null);
        setParsedUrl(null);
        return null;
      }

      // Find matching adapter
      const adapter = defaultSourceRegistry.getAdapter(url);
      if (!adapter) {
        setDetectedType(null);
        setParsedUrl(null);
        return null;
      }

      const parsed = adapter.parseUrl(url);
      setDetectedType(adapter.type);
      setParsedUrl(parsed);

      if (parsed.isValid) {
        onDetect?.(adapter.type, parsed);
      }

      return adapter.type;
    },
    [onDetect],
  );

  const clear = useCallback(() => {
    setDetectedType(null);
    setParsedUrl(null);
  }, []);

  return {
    detectedType,
    parsedUrl,
    detect,
    clear,
  };
}
