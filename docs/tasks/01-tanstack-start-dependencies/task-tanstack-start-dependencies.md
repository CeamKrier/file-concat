# Task 01: TanStack Start Dependencies Kurulumu

## Ozet

Mevcut Vite + React projesine TanStack Start framework bagimliklarini ekle ve gereksiz bagimliliklari kaldir.

## Oncelik

Yuksek (Faz 1 - Migration)

## Bagimliliklari

- Yok (ilk gorev)

## Basari Kriterleri

- [ ] TanStack Start paketleri kurulu
- [ ] Cloudflare Vite plugin kurulu
- [ ] `pnpm install` hatasiz calisiyor
- [ ] TypeScript hatalari yok

## Detayli Adimlar

### 1. Mevcut Dependencies Analizi

**Silinecekler:**

```json
// apps/web/package.json'dan kaldirilacak
// (Hicbir sey kaldirilmayacak, TanStack Start Vite uzerine kurulu)
```

### 2. Yeni Dependencies Ekleme

```bash
cd apps/web
pnpm add @tanstack/react-start @tanstack/react-router
pnpm add -D @cloudflare/vite-plugin wrangler
```

### 3. package.json Guncelleme

**Dosya:** `apps/web/package.json`

**Eklenecek dependencies:**

```json
{
  "dependencies": {
    "@tanstack/react-start": "^1.112.0",
    "@tanstack/react-router": "^1.112.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.0.0",
    "wrangler": "^3.99.0"
  }
}
```

### 4. Scripts Guncelleme

**Dosya:** `apps/web/package.json`

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node .output/server/index.mjs",
    "deploy": "pnpm build && wrangler deploy",
    "check": "tsc --noEmit"
  }
}
```

## Mevcut Dosya Icerikleri (Referans)

**apps/web/package.json (mevcut):**

```json
{
  "name": "@fileconcat/web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@dqbd/tiktoken": "^1.0.22",
    "@fileconcat/core": "workspace:*",
    "@icons-pack/react-simple-icons": "^12.4.0",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-progress": "^1.1.2",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-tabs": "^1.1.3",
    "@uiw/react-codemirror": "^4.25.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "file-type": "^20.5.0",
    "lucide-react": "^0.468.0",
    "minimatch": "^10.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "rollup-plugin-visualizer": "^5.14.0",
    "tailwindcss": "^3.4.18",
    "typescript": "~5.6.3",
    "vite": "^6.4.1",
    "vite-plugin-top-level-await": "^1.5.0",
    "vite-plugin-wasm": "^3.4.1"
  }
}
```

## Test Etme

```bash
cd apps/web
pnpm install
pnpm check
```

## Notlar

- TanStack Start alpha versiyonda, `^1.112.0` veya daha guncel kullanilacak
- Cloudflare plugin SSR icin gerekli
- Wrangler deployment icin gerekli
- Mevcut Vite plugins (wasm, top-level-await) korunacak

## Rollback

Eger basarisiz olursa:

```bash
git checkout apps/web/package.json
pnpm install
```
