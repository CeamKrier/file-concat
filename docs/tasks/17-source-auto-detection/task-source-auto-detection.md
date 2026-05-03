# Task 17: Source Auto-Detection Enhancement

## Ozet

URL yapistirma sirasinda source type'i otomatik algilama ve kullaniciya oneri sunma. Task 16'da basic implementation var, bu task enhancement'lar icin.

## Oncelik

Orta (Faz 4 - UX)

## Bagimliliklari

- Task 16: Unified Source Input UI (tamamlanmis)

## Basari Kriterleri

- [ ] Clipboard paste event'i yakalaniyor
- [ ] Source type dogru algilaniyor
- [ ] Tab otomatik degisiyor (user preference'a gore)
- [ ] Toast/notification ile bilgilendirme

## Detayli Adimlar

### 1. Auto-Detection Hook

**Dosya:** `apps/web/src/hooks/use-source-detection.ts` (yeni)

```typescript
import { useState, useEffect, useCallback } from "react";
import type { SourceType, ParsedSourceUrl } from "@fileconcat/core";
import { defaultSourceRegistry } from "@fileconcat/core";

interface UseSourceDetectionOptions {
  /** Auto-switch to detected source */
  autoSwitch?: boolean;
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
```

### 2. Clipboard Paste Handler

**Dosya:** `apps/web/src/hooks/use-paste-detection.ts` (yeni)

```typescript
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
```

### 3. Source Input Enhancement

**Dosya:** `apps/web/src/components/source-input.tsx`

Paste detection ekle:

```tsx
import { usePasteDetection } from "~/hooks/use-paste-detection";

// Component icinde
const SourceInput = forwardRef<SourceInputRef, SourceInputProps>(({ onSubmit, isLoading }, ref) => {
  // ... mevcut state

  // Paste detection
  usePasteDetection({
    enabled: !isLoading && !url,
    onPaste: (pastedUrl, detectedType) => {
      setUrl(pastedUrl);

      if (detectedType && detectedType !== sourceType) {
        // Show toast or auto-switch
        setAutoDetected(detectedType);

        // Optional: Auto-switch based on user preference
        const autoSwitch = localStorage.getItem("fileconcat-auto-switch-source");
        if (autoSwitch === "true") {
          setSourceType(detectedType);
          setAutoDetected(null);
        }
      }
    },
  });

  // ... rest of component
});
```

### 4. User Preference Storage

**Dosya:** `apps/web/src/hooks/use-config.ts`

UserConfig'e yeni alan ekle:

```typescript
export type UserConfig = {
  version: 3; // Bump version
  // ... mevcut alanlar
  // Source preferences
  autoSwitchSource: boolean;
  defaultSourceType: SourceType;
};

const DEFAULT_CONFIG: UserConfig = {
  // ... mevcut defaults
  autoSwitchSource: false,
  defaultSourceType: "github",
};
```

### 5. Settings Panel'e Preference Ekleme

**Dosya:** `apps/web/src/components/config-panel.tsx`

```tsx
// Source Preferences section
<div className="space-y-3">
  <Label>Source Preferences</Label>
  <div className="space-y-2">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={config.autoSwitchSource}
        onChange={(e) => setConfig({ autoSwitchSource: e.target.checked })}
        className="rounded"
      />
      <span className="text-sm">Auto-switch to detected source type</span>
    </label>
  </div>
</div>
```

## Test Etme

```bash
cd apps/web
pnpm dev

# Test checklist:
# [ ] GitHub URL yapistir -> GitHub algiliyor
# [ ] GitLab URL yapistir -> GitLab algiliyor
# [ ] Auto-switch disabled: "Use GitLab" butonu gozukuyor
# [ ] Auto-switch enabled: otomatik tab degisiyor
# [ ] Settings'te preference degistirilebiliyor
```

## Notlar

- Paste detection global, input focus gerekmez
- Auto-switch default off (kullanici beklentisi)
- Detection sadece http/https URL'ler icin calisir

## Rollback

```bash
rm apps/web/src/hooks/use-source-detection.ts
rm apps/web/src/hooks/use-paste-detection.ts
# source-input.tsx'ten paste detection kaldir
# use-config.ts'ten yeni alanlar kaldir
```
