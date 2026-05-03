# Task 18: Recent Sources History

## Ozet

Kullanicinin son kullandigi URL'leri localStorage'da saklayip quick access dropdown goster.

## Oncelik

Orta (Faz 4 - UX)

## Bagimliliklari

- Task 16: Unified Source Input UI (tamamlanmis)

## Basari Kriterleri

- [ ] Son 10 kaynak saklaniyor
- [ ] Dropdown'dan hizli erisim
- [ ] Her kaynak icin source type icon'u gozukuyor
- [ ] Gecmis temizlenebiliyor

## Detayli Adimlar

### 1. Recent Sources Hook

**Dosya:** `apps/web/src/hooks/use-recent-sources.ts` (yeni)

```typescript
import { useState, useEffect, useCallback } from "react";
import type { SourceType } from "@fileconcat/core";

const STORAGE_KEY = "fileconcat-recent-sources";
const MAX_RECENT = 10;

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
        const parsed = JSON.parse(stored) as RecentSource[];
        // Filter out invalid entries and sort by timestamp
        const valid = parsed
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSources));
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
```

### 2. Recent Sources Dropdown Component

**Dosya:** `apps/web/src/components/recent-sources-dropdown.tsx` (yeni)

```tsx
import { History, X, Trash2 } from "lucide-react";
import { SiGithub, SiGitlab, SiBitbucket } from "@icons-pack/react-simple-icons";
import { FileCode, Link } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { RecentSource } from "~/hooks/use-recent-sources";
import type { SourceType } from "@fileconcat/core";

interface RecentSourcesDropdownProps {
  sources: RecentSource[];
  onSelect: (source: RecentSource) => void;
  onRemove: (url: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

const SOURCE_ICONS: Record<SourceType, React.ReactNode> = {
  github: <SiGithub className="h-3.5 w-3.5" />,
  gitlab: <SiGitlab className="h-3.5 w-3.5" />,
  bitbucket: <SiBitbucket className="h-3.5 w-3.5" />,
  gist: <FileCode className="h-3.5 w-3.5" />,
  url: <Link className="h-3.5 w-3.5" />,
  local: null,
};

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function RecentSourcesDropdown({
  sources,
  onSelect,
  onRemove,
  onClear,
  disabled,
}: RecentSourcesDropdownProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" disabled={disabled} title="Recent sources">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Recent Sources</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 text-xs"
            onClick={onClear}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
        <ScrollArea className="max-h-[250px]">
          <div className="p-1">
            {sources.map((source) => (
              <div
                key={source.url}
                className="hover:bg-accent group flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <button
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => onSelect(source)}
                >
                  <span className="text-muted-foreground shrink-0">
                    {SOURCE_ICONS[source.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{source.name}</div>
                    <div className="text-muted-foreground truncate text-xs">{source.url}</div>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatTimestamp(source.timestamp)}
                  </span>
                </button>
                <button
                  className="hover:text-destructive shrink-0 p-1 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(source.url);
                  }}
                  title="Remove from history"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

### 3. Source Input'a Entegrasyon

**Dosya:** `apps/web/src/components/source-input.tsx`

```tsx
import { useRecentSources, RecentSource } from "~/hooks/use-recent-sources";
import { RecentSourcesDropdown } from "~/components/recent-sources-dropdown";

const SourceInput = forwardRef<SourceInputRef, SourceInputProps>(({ onSubmit, isLoading }, ref) => {
  // ... mevcut state

  const {
    sources: recentSources,
    add: addRecent,
    remove: removeRecent,
    clear: clearRecent,
  } = useRecentSources();

  // Basarili fetch sonrasi history'e ekle
  const handleSubmit = async (e: React.FormEvent) => {
    // ... mevcut logic

    try {
      // ... fetch logic

      // Basarili olursa history'e ekle
      addRecent({
        url,
        type: effectiveType,
        name: "", // extractName otomatik yapacak
      });

      // ... rest
    } catch (error) {
      // ...
    }
  };

  // Recent source secimi
  const handleRecentSelect = (source: RecentSource) => {
    setUrl(source.url);
    setSourceType(source.type);
    setAutoDetected(null);
    setValidationError(null);
  };

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

      {/* ... rest of component */}
    </div>
  );
});
```

## Test Etme

```bash
cd apps/web
pnpm dev

# Test checklist:
# [ ] Basarili fetch sonrasi history'e ekleniyor
# [ ] Recent dropdown gosteriliyor (en az 1 kaynak varsa)
# [ ] Recent'tan secim URL'i ve tab'i dolduruyor
# [ ] Tek kaynak silinebiliyor
# [ ] Tum history temizlenebiliyor
# [ ] Page refresh sonrasi history korunuyor
```

## Notlar

- Max 10 kaynak saklaniyor
- Duplicate URL'ler guncelleniyor (timestamp yenileniyor)
- Display name URL'den otomatik cikariliyor
- Timestamp relative format (5m ago, 2h ago, etc.)

## Rollback

```bash
rm apps/web/src/hooks/use-recent-sources.ts
rm apps/web/src/components/recent-sources-dropdown.tsx
# source-input.tsx'ten recent sources entegrasyonunu kaldir
```
