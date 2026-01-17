---
name: client-storage
description: Implement client-side storage patterns using localStorage, sessionStorage, or IndexedDB. Use for persisting user preferences, caching data, handling storage quota, and migrating stored data schemas.
---

# Client Storage

## When to Use This Skill

Use when you need to:
- Persist data in the browser (preferences, cache, state)
- Handle storage quota limits and errors
- Migrate data between schema versions
- Choose between localStorage, sessionStorage, or IndexedDB

## Storage Selection Guide

| Storage | Capacity | Persistence | Use Case |
|---------|----------|-------------|----------|
| localStorage | ~5-10MB | Permanent | User preferences, config |
| sessionStorage | ~5-10MB | Tab session | Temporary state |
| IndexedDB | GB+ | Permanent | Large datasets, files |

## Implementation Patterns

### 1. Basic localStorage with Error Handling

```typescript
function getItem<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded');
    }
    return false;
  }
}
```

### 2. Versioned Config Pattern

```typescript
type Config = {
  version: number;
  // ... config fields
};

const CURRENT_VERSION = 2;

function migrateConfig(old: unknown): Config {
  const config = old as Record<string, unknown>;

  // v1 -> v2 migration
  if (!config.version || config.version < 2) {
    return {
      version: CURRENT_VERSION,
      // migrate fields...
    };
  }

  return config as Config;
}

function loadConfig(): Config {
  const stored = getItem('config', null);
  if (!stored) return DEFAULT_CONFIG;

  if (stored.version !== CURRENT_VERSION) {
    const migrated = migrateConfig(stored);
    setItem('config', migrated);
    return migrated;
  }

  return stored;
}
```

### 3. React Hook Pattern

```typescript
function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() =>
    getItem(key, defaultValue)
  );

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = newValue instanceof Function
        ? newValue(prev)
        : newValue;
      setItem(key, resolved);
      return resolved;
    });
  }, [key]);

  return [value, setStoredValue] as const;
}
```

### 4. IndexedDB for Large Data

```typescript
async function openDB(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Create object stores during upgrade
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
    };
  });
}
```

## Quota Handling

```typescript
async function checkStorageQuota(): Promise<{used: number; quota: number}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return { used: 0, quota: 0 };
}
```

## Best Practices

1. **Always wrap in try-catch** - Storage can fail (private mode, quota)
2. **Version your schemas** - Enable smooth migrations
3. **Use type guards** - Validate data structure on load
4. **Handle quota errors** - Inform user, cleanup old data
5. **Sync across tabs** - Use `storage` event for multi-tab apps
