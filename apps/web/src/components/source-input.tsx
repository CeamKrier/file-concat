import { useState, forwardRef, useImperativeHandle, useRef, useMemo, useEffect } from "react";
import { Link, FileCode, Loader2, XCircle, Sparkles } from "lucide-react";
import { SiGithub, SiGitlab, SiBitbucket } from "@icons-pack/react-simple-icons";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import DownloadProgress from "~/components/download-progress";
import { RecentSourcesDropdown } from "~/components/recent-sources-dropdown";
import { usePasteDetection } from "~/hooks/use-paste-detection";
import { useRecentSources, type RecentSource } from "~/hooks/use-recent-sources";

import type {
  SourceType,
  DownloadProgress as DownloadProgressType,
  UserConfig,
} from "@fileconcat/core";
import { SOURCE_METADATA, defaultSourceRegistry, getRemoteSourceTypes } from "@fileconcat/core";

interface SourceInputProps {
  onSubmit: (
    url: string,
    sourceType: SourceType,
    onProgress: (progress: DownloadProgressType) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  isLoading: boolean;
  /** User config for auto-switch preference */
  config?: Pick<UserConfig, "autoSwitchSource" | "defaultSourceType">;
}

export interface SourceInputRef {
  reset: () => void;
  abort: () => void;
}

/** Icons for each source type */
const SOURCE_ICONS: Record<SourceType, React.ReactNode> = {
  github: <SiGithub className="h-4 w-4" />,
  gitlab: <SiGitlab className="h-4 w-4" />,
  bitbucket: <SiBitbucket className="h-4 w-4" />,
  gist: <FileCode className="h-4 w-4" />,
  url: <Link className="h-4 w-4" />,
  local: null,
};

const SourceInput = forwardRef<SourceInputRef, SourceInputProps>(
  ({ onSubmit, isLoading, config }, ref) => {
    const [url, setUrl] = useState("");
    const [sourceType, setSourceType] = useState<SourceType>(config?.defaultSourceType || "github");
    const [autoDetected, setAutoDetected] = useState<SourceType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [progress, setProgress] = useState<DownloadProgressType>({
      currentFile: "",
      totalFiles: 0,
      completedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    // Recent sources hook
    const {
      sources: recentSources,
      add: addRecent,
      remove: removeRecent,
      clear: clearRecent,
    } = useRecentSources();

    // Recent source selection handler
    const handleRecentSelect = (source: RecentSource) => {
      setUrl(source.url);
      setSourceType(source.type);
      setAutoDetected(null);
      setValidationError(null);
      setError(null);
    };

    // Get remote source types (excluding 'local')
    const remoteTypes = useMemo(() => getRemoteSourceTypes(), []);

    // Update source type when config changes
    useEffect(() => {
      if (config?.defaultSourceType && !url) {
        setSourceType(config.defaultSourceType);
      }
    }, [config?.defaultSourceType, url]);

    // Paste detection - auto-fill URL when pasting
    usePasteDetection({
      enabled: !isLoading && !url,
      onPaste: (pastedUrl, detectedType) => {
        setUrl(pastedUrl);
        setError(null);
        setValidationError(null);

        if (detectedType && detectedType !== sourceType) {
          // Auto-switch if enabled
          if (config?.autoSwitchSource) {
            setSourceType(detectedType);
            setAutoDetected(null);
          } else {
            // Show auto-detected indicator
            setAutoDetected(detectedType);
          }
        }
      },
    });

    // Auto-detect source type when URL changes
    const handleUrlChange = (value: string) => {
      setUrl(value);
      setError(null);
      setValidationError(null);
      setAutoDetected(null);

      if (!value.trim()) return;

      // Try to auto-detect
      const detected = defaultSourceRegistry.detectType(value);
      if (detected && detected !== "url") {
        setAutoDetected(detected);
      }

      // Validate for current source type
      const adapter = defaultSourceRegistry.getByType(sourceType);
      if (adapter && value.trim()) {
        const parsed = adapter.parseUrl(value);
        if (!parsed.isValid) {
          setValidationError(parsed.error || "Invalid URL");
        }
      }
    };

    // Switch to auto-detected source
    const useDetectedSource = () => {
      if (autoDetected) {
        setSourceType(autoDetected);
        setAutoDetected(null);
        setValidationError(null);
      }
    };

    // Expose reset and abort through ref
    useImperativeHandle(ref, () => ({
      reset: () => {
        setUrl("");
        setError(null);
        setValidationError(null);
        setAutoDetected(null);
        setProgress({
          currentFile: "",
          totalFiles: 0,
          completedFiles: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          speed: 0,
        });
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
      },
      abort: () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
      },
    }));

    const handleAbort = () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setError("Fetch aborted");
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setProgress({
        currentFile: "",
        totalFiles: 0,
        completedFiles: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
      });

      // Use auto-detected type if available
      const effectiveType = autoDetected || sourceType;

      // Validate URL
      const adapter = defaultSourceRegistry.getByType(effectiveType);
      if (!adapter) {
        setError("Unknown source type");
        return;
      }

      const parsed = adapter.parseUrl(url);
      if (!parsed.isValid) {
        setError(parsed.error || "Invalid URL");
        return;
      }

      try {
        abortControllerRef.current = new AbortController();
        await onSubmit(url, effectiveType, setProgress, abortControllerRef.current.signal);
        abortControllerRef.current = null;

        // Add to recent sources on successful fetch
        addRecent({
          url,
          type: effectiveType,
          name: "", // extractName will be called automatically
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError" || error.message === "AbortError") {
            setError("Fetch aborted");
          } else {
            setError(error.message);
          }
        } else {
          setError("Failed to fetch");
        }
      }
    };

    const currentMeta = SOURCE_METADATA[sourceType];

    return (
      <div className="space-y-4 rounded-lg border p-4">
        {/* Header with recent sources */}
        <div className="flex items-center justify-between">
          <Label>Import from</Label>
          <RecentSourcesDropdown
            sources={recentSources}
            onSelect={handleRecentSelect}
            onRemove={removeRecent}
            onClear={clearRecent}
            disabled={isLoading}
          />
        </div>

        <Tabs
          value={sourceType}
          onValueChange={(v) => {
            setSourceType(v as SourceType);
            setValidationError(null);
            setAutoDetected(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-5">
            {remoteTypes.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                className="flex items-center gap-1.5"
                disabled={isLoading}
              >
                {SOURCE_ICONS[type]}
                <span className="hidden sm:inline">{SOURCE_METADATA[type].name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* URL Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <div className="relative">
              <Input
                type="url"
                placeholder={currentMeta.placeholder}
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="pr-20"
                disabled={isLoading}
              />
              {autoDetected && autoDetected !== sourceType && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 -translate-y-1/2 text-xs"
                  onClick={useDetectedSource}
                >
                  <Sparkles className="mr-1 h-3 w-3 text-yellow-500" />
                  Use {SOURCE_METADATA[autoDetected].name}
                </Button>
              )}
            </div>

            {/* Help text */}
            <p className="text-muted-foreground text-xs">{currentMeta.helpText}</p>

            {/* Validation error */}
            {validationError && !error && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">{validationError}</p>
            )}
          </div>

          {/* Submit/Abort buttons */}
          <div className="flex gap-2">
            {isLoading ? (
              <>
                <Button disabled variant="secondary" className="flex-1">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching...
                </Button>
                <Button type="button" variant="destructive" onClick={handleAbort}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Abort
                </Button>
              </>
            ) : (
              <Button type="submit" disabled={!url.trim()} className="flex-1">
                Fetch Files
              </Button>
            )}
          </div>
        </form>

        {/* Error message */}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Progress */}
        <DownloadProgress
          isLoading={isLoading}
          currentFile={progress.currentFile}
          totalFiles={progress.totalFiles}
          completedFiles={progress.completedFiles}
          downloadedBytes={progress.downloadedBytes}
          speed={progress.speed}
          totalBytes={progress.totalBytes}
        />

        {/* Example URLs */}
        {!isLoading && !url && currentMeta.examples.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Examples:</p>
            <div className="flex flex-wrap gap-1">
              {currentMeta.examples.map((example, i) => (
                <button
                  key={i}
                  type="button"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  onClick={() => handleUrlChange(example)}
                >
                  {example.length > 50 ? example.substring(0, 50) + "..." : example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

SourceInput.displayName = "SourceInput";

export default SourceInput;
