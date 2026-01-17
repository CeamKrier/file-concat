---
name: state-migration
description: Implement versioned state schemas with backward compatibility and data migration patterns. Use when persisted state needs to evolve across app versions while preserving user data.
---

# State Migration

## When to Use This Skill

Use when:
- Changing localStorage/IndexedDB schema
- Adding or removing properties from persisted state
- Renaming fields or changing data types
- Ensuring backward compatibility for existing users

## Version Schema Pattern

### Type Definition

```typescript
// Always include version in persisted types
type ConfigV1 = {
  version: 1;
  theme: string;
  customPatterns: string[];  // Old: array
};

type ConfigV2 = {
  version: 2;
  theme: string;
  customPatterns: string;    // New: comma-separated string
  removeEmptyLines: boolean; // New field
};

type ConfigV3 = {
  version: 3;
  theme: 'light' | 'dark' | 'system';  // Stricter type
  ignorePatterns: string;    // Renamed from customPatterns
  removeEmptyLines: boolean;
  showLineNumbers: boolean;  // New field
};

// Current version is always the latest
type CurrentConfig = ConfigV3;
const CURRENT_VERSION = 3;
```

## Migration Functions

### Step-by-Step Migrations

```typescript
function migrateV1toV2(v1: ConfigV1): ConfigV2 {
  return {
    version: 2,
    theme: v1.theme,
    customPatterns: v1.customPatterns.join(', '),
    removeEmptyLines: false, // Default for new field
  };
}

function migrateV2toV3(v2: ConfigV2): ConfigV3 {
  return {
    version: 3,
    theme: validateTheme(v2.theme),
    ignorePatterns: v2.customPatterns, // Renamed
    removeEmptyLines: v2.removeEmptyLines,
    showLineNumbers: false, // Default for new field
  };
}

function validateTheme(theme: string): 'light' | 'dark' | 'system' {
  if (['light', 'dark', 'system'].includes(theme)) {
    return theme as 'light' | 'dark' | 'system';
  }
  return 'system'; // Default fallback
}
```

### Migration Pipeline

```typescript
function migrateConfig(stored: unknown): CurrentConfig {
  let config = stored as Record<string, unknown>;

  // Handle no version (legacy data)
  if (!config.version) {
    config = { version: 1, ...config };
  }

  // Chain migrations
  if (config.version === 1) {
    config = migrateV1toV2(config as ConfigV1);
  }
  if (config.version === 2) {
    config = migrateV2toV3(config as ConfigV2);
  }

  return config as CurrentConfig;
}
```

## Loading with Migration

```typescript
const STORAGE_KEY = 'app-config';

function loadConfig(): CurrentConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return DEFAULT_CONFIG;
    }

    const parsed = JSON.parse(stored);

    // Already current version
    if (parsed.version === CURRENT_VERSION) {
      return parsed as CurrentConfig;
    }

    // Migrate and save
    const migrated = migrateConfig(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));

    console.log(`Migrated config from v${parsed.version} to v${CURRENT_VERSION}`);
    return migrated;

  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}
```

## React Hook Pattern

```typescript
function useVersionedConfig<T extends { version: number }>(
  key: string,
  currentVersion: number,
  defaultConfig: T,
  migrate: (old: unknown) => T
) {
  const [config, setConfigState] = useState<T>(defaultConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        const migrated = parsed.version === currentVersion
          ? parsed
          : migrate(parsed);

        setConfigState(migrated);

        if (parsed.version !== currentVersion) {
          localStorage.setItem(key, JSON.stringify(migrated));
        }
      }
    } catch {
      // Use default
    }
    setIsLoaded(true);
  }, [key, currentVersion, migrate]);

  const setConfig = useCallback((updates: Partial<Omit<T, 'version'>>) => {
    setConfigState(prev => {
      const newConfig = { ...prev, ...updates };
      localStorage.setItem(key, JSON.stringify(newConfig));
      return newConfig;
    });
  }, [key]);

  return { config, setConfig, isLoaded };
}
```

## Testing Migrations

```typescript
describe('Config Migration', () => {
  it('migrates v1 to current version', () => {
    const v1: ConfigV1 = {
      version: 1,
      theme: 'dark',
      customPatterns: ['*.log', 'node_modules'],
    };

    const result = migrateConfig(v1);

    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.theme).toBe('dark');
    expect(result.ignorePatterns).toBe('*.log, node_modules');
    expect(result.removeEmptyLines).toBe(false);
    expect(result.showLineNumbers).toBe(false);
  });

  it('handles corrupted data gracefully', () => {
    const corrupted = { invalid: 'data' };

    const result = migrateConfig(corrupted);

    expect(result.version).toBe(CURRENT_VERSION);
    // Should have defaults for missing fields
  });
});
```

## Best Practices

1. **Always version** - Include `version: number` in all persisted types
2. **Never skip versions** - Migrate through each version sequentially
3. **Provide defaults** - New fields should have sensible defaults
4. **Test migrations** - Unit test each migration path
5. **Log migrations** - Help debug issues in production
6. **Handle corruption** - Fall back gracefully on parse errors
7. **Immutable migrations** - Return new objects, don't mutate
