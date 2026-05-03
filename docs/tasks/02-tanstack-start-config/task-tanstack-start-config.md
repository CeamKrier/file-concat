# Task 02: TanStack Start Konfigurasyonu

## Ozet

Vite config dosyasini TanStack Start icin guncelle ve app.config.ts olustur.

## Oncelik

Yuksek (Faz 1 - Migration)

## Bagimliliklari

- Task 01: TanStack Start Dependencies (tamamlanmis olmali)

## Basari Kriterleri

- [ ] vite.config.ts TanStack Start plugin iceriyor
- [ ] app.config.ts olusturuldu
- [ ] wrangler.jsonc olusturuldu
- [ ] `pnpm dev` hatasiz calisiyor
- [ ] `pnpm build` hatasiz calisiyor

## Detayli Adimlar

### 1. Vite Config Guncelleme

**Dosya:** `apps/web/vite.config.ts`

**Mevcut icerik:**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    visualizer({
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@fileconcat/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@dqbd/tiktoken"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          tiktoken: ["@dqbd/tiktoken"],
          codemirror: ["@uiw/react-codemirror"],
          "radix-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-label",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
          ],
          icons: ["lucide-react", "@icons-pack/react-simple-icons"],
          "file-type": ["file-type"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
```

**Yeni icerik:**

```typescript
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    // Cloudflare SSR environment
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // TanStack Start - must come before React
    tanstackStart(),
    // WASM support for tiktoken
    wasm(),
    topLevelAwait(),
    // React
    react(),
    // Bundle analyzer (dev only)
    visualizer({
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./src"),
      "@fileconcat/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@dqbd/tiktoken"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          tiktoken: ["@dqbd/tiktoken"],
          codemirror: ["@uiw/react-codemirror"],
          "radix-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-label",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
          ],
          icons: ["lucide-react", "@icons-pack/react-simple-icons"],
          "file-type": ["file-type"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
```

### 2. App Config Olusturma

**Dosya:** `apps/web/app.config.ts` (yeni)

```typescript
import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
  // Server configuration
  server: {
    // Cloudflare Workers preset
    preset: "cloudflare-pages",
  },
  // React configuration
  react: {
    // Enable React strict mode
    strictMode: true,
  },
  // Router configuration
  routers: {
    // File-based routing
    ssr: {
      entry: "./src/entry-server.tsx",
    },
    client: {
      entry: "./src/entry-client.tsx",
    },
  },
});
```

### 3. Wrangler Config Olusturma

**Dosya:** `apps/web/wrangler.jsonc` (yeni)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fileconcat",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".output/server/index.mjs",
  "assets": {
    "directory": ".output/public",
  },
}
```

### 4. TypeScript Config Guncelleme (Opsiyonel)

**Dosya:** `apps/web/tsconfig.json`

Eger `~` alias kullanilacaksa:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "~/*": ["./src/*"]
    }
  }
}
```

## Test Etme

```bash
cd apps/web

# Build test
pnpm build

# Dev server test
pnpm dev
# http://localhost:3000 acilmali
```

## Notlar

- Plugin sirasi onemli: cloudflare -> tanstackStart -> wasm -> react
- `~` alias TanStack Start convention'i, `@` mevcut alias korunuyor
- wrangler.jsonc Cloudflare deployment icin gerekli
- compatibility_flags nodejs_compat WASM icin gerekli olabilir

## Muhtemel Hatalar

1. **Plugin conflict**: Eger hata olursa cloudflare plugin'i gecici olarak devre disi birak
2. **WASM issues**: tiktoken WASM Cloudflare Workers'da calismazsa client-only yapilacak
3. **Build output path**: `.output` klasoru TanStack Start default'u

## Rollback

```bash
git checkout apps/web/vite.config.ts
rm apps/web/app.config.ts
rm apps/web/wrangler.jsonc
```
