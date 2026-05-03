# Task 07: models.dev Build-Time Fetch Script

## Ozet

Build sirasinda models.dev API'sinden model verilerini cekip statik JSON olarak kaydeden script olustur. Bu fallback data olarak kullanilacak.

## Oncelik

Yuksek (Faz 2 - Model Data)

## Bagimliliklari

- Task 06: Model Types (tamamlanmis)

## Basari Kriterleri

- [ ] Script models.dev API'sinden veri cekiyor
- [ ] Sadece text input destekleyen modeller filtreleniyor
- [ ] JSON dosyasi dogru lokasyona kaydediliyor
- [ ] Build sirasinda otomatik calistirilabiliyor
- [ ] Hata durumunda graceful failure

## Detayli Adimlar

### 1. Script Dosyasi Olusturma

**Dosya:** `apps/web/scripts/fetch-models.ts` (yeni)

```typescript
#!/usr/bin/env npx tsx
/**
 * Build-time script to fetch AI models from models.dev API
 * Filters to only include text-input models
 * Saves to src/data/models.json as fallback data
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Types (inline to avoid import issues in script)
interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
}

interface ModelLimits {
  context: number;
  output: number;
}

interface AIModel {
  id: string;
  name: string;
  family: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  modalities: {
    input: string[];
    output: string[];
  };
  open_weights: boolean;
  cost: ModelCost;
  limit: ModelLimits;
}

interface AIProvider {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  doc?: string;
  models: Record<string, AIModel>;
}

interface FilteredModel {
  uid: string;
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  contextLimit: number;
  outputLimit: number;
  inputCost: number;
  outputCost: number;
  hasReasoning: boolean;
  hasToolCall: boolean;
}

interface ModelsRegistry {
  providers: Record<string, AIProvider>;
  lastUpdated: string;
  totalModels: number;
  textModels: FilteredModel[];
}

const MODELS_API_URL = "https://models.dev/api.json";
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/data");
const OUTPUT_FILE = join(OUTPUT_DIR, "models.json");

async function fetchModels(): Promise<Record<string, AIProvider>> {
  console.log("Fetching models from", MODELS_API_URL);

  const response = await fetch(MODELS_API_URL, {
    headers: {
      "User-Agent": "FileConcat/1.0 (https://fileconcat.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function filterTextModels(providers: Record<string, AIProvider>): FilteredModel[] {
  const textModels: FilteredModel[] = [];

  for (const [providerId, provider] of Object.entries(providers)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      // Filter: only models that support text input
      if (!model.modalities?.input?.includes("text")) {
        continue;
      }

      // Filter: only models that output text
      if (!model.modalities?.output?.includes("text")) {
        continue;
      }

      // Filter: skip embedding models (no output cost usually)
      if (model.cost.output === 0 && model.name.toLowerCase().includes("embedding")) {
        continue;
      }

      // Filter: skip models with 0 context (invalid/placeholder)
      if (!model.limit?.context || model.limit.context === 0) {
        continue;
      }

      textModels.push({
        uid: `${providerId}/${modelId}`,
        id: modelId,
        name: model.name,
        providerId,
        providerName: provider.name,
        contextLimit: model.limit.context,
        outputLimit: model.limit.output,
        inputCost: model.cost.input,
        outputCost: model.cost.output,
        hasReasoning: model.reasoning ?? false,
        hasToolCall: model.tool_call ?? false,
      });
    }
  }

  // Sort by context limit (descending), then by input cost (ascending)
  textModels.sort((a, b) => {
    if (b.contextLimit !== a.contextLimit) {
      return b.contextLimit - a.contextLimit;
    }
    return a.inputCost - b.inputCost;
  });

  return textModels;
}

function countTotalModels(providers: Record<string, AIProvider>): number {
  let count = 0;
  for (const provider of Object.values(providers)) {
    count += Object.keys(provider.models).length;
  }
  return count;
}

async function main() {
  try {
    const providers = await fetchModels();
    const textModels = filterTextModels(providers);
    const totalModels = countTotalModels(providers);

    const registry: ModelsRegistry = {
      providers,
      lastUpdated: new Date().toISOString(),
      totalModels,
      textModels,
    };

    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write JSON file
    writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));

    console.log(
      `Success! Saved ${textModels.length} text models (${totalModels} total) to ${OUTPUT_FILE}`,
    );
    console.log(`Last updated: ${registry.lastUpdated}`);

    // Print some stats
    const providerCounts = new Map<string, number>();
    for (const model of textModels) {
      providerCounts.set(model.providerName, (providerCounts.get(model.providerName) || 0) + 1);
    }
    console.log("\nModels per provider:");
    for (const [provider, count] of [...providerCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${provider}: ${count}`);
    }
  } catch (error) {
    console.error("Error fetching models:", error);
    process.exit(1);
  }
}

main();
```

### 2. Data Klasoru Olusturma

```bash
mkdir -p apps/web/src/data
```

### 3. Fallback Data Olusturma

**Dosya:** `apps/web/src/data/models.json` (bos baslangic)

```json
{
  "providers": {},
  "lastUpdated": "1970-01-01T00:00:00.000Z",
  "totalModels": 0,
  "textModels": []
}
```

### 4. Package.json Scripts Ekleme

**Dosya:** `apps/web/package.json`

```json
{
  "scripts": {
    "fetch-models": "tsx scripts/fetch-models.ts",
    "prebuild": "pnpm fetch-models",
    "dev": "vite dev",
    "build": "vite build",
    "...": "..."
  }
}
```

### 5. tsx Dependency Ekleme

```bash
cd apps/web
pnpm add -D tsx
```

### 6. .gitignore Guncelleme (Opsiyonel)

Eger models.json git'te tutulmayacaksa:

**Dosya:** `apps/web/.gitignore`

```
# Build-generated data
src/data/models.json
```

Veya tutulacaksa (onerilir - offline build icin):

```
# Keep models.json for offline builds
!src/data/models.json
```

## Test Etme

```bash
cd apps/web

# Script'i manuel calistir
pnpm fetch-models

# Dosyanin olusturuldugunu kontrol et
cat src/data/models.json | head -100

# Build sirasinda calistigini kontrol et
pnpm build
```

## Beklenen Output

```
Fetching models from https://models.dev/api.json
Success! Saved 150+ text models (200+ total) to src/data/models.json
Last updated: 2024-01-23T10:30:00.000Z

Models per provider:
  OpenAI: 25
  Anthropic: 15
  Google: 30
  ...
```

## Notlar

- Script tsx ile calisir (TypeScript runner)
- prebuild hook her build oncesi otomatik calisir
- Network hatasi olursa mevcut models.json korunur
- Embedding modelleri filtreleniyor (text generation degil)
- Context: 0 olan modeller filtreleniyor (gecersiz)

## Muhtemel Hatalar

1. **Network timeout**: fetch timeout eklenebilir
2. **API rate limit**: User-Agent header eklendi
3. **Invalid JSON**: try-catch ile handle ediliyor

## Rollback

```bash
rm apps/web/scripts/fetch-models.ts
rm -rf apps/web/src/data
# package.json'dan scripts kaldir
```
