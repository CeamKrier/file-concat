---
name: pwa-setup
description: Configure Progressive Web App features including service workers, offline support, web app manifest, and install prompts. Use when making a web app installable or work offline.
---

# Progressive Web App (PWA) Setup

## When to Use This Skill

Use when:
- Making a web app installable on devices
- Enabling offline functionality
- Implementing caching strategies
- Showing install prompts

## Web App Manifest

### manifest.json

```json
{
  "name": "My Application",
  "short_name": "MyApp",
  "description": "Description of the app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### Link in HTML

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#000000">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

## Vite PWA Plugin

### Installation

```bash
pnpm add -D vite-plugin-pwa
```

### vite.config.ts

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'My Application',
        short_name: 'MyApp',
        theme_color: '#000000',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.example\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ]
});
```

## Service Worker (Manual)

### sw.js

```javascript
const CACHE_NAME = 'app-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate (cleanup old caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch (cache-first strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

### Registration

```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('SW registered'))
      .catch((err) => console.error('SW failed:', err));
  });
}
```

## Install Prompt

```tsx
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return { isInstallable, install };
}
```

## Caching Strategies

| Strategy | Use Case |
|----------|----------|
| **Cache First** | Static assets, images |
| **Network First** | API responses, dynamic data |
| **Stale While Revalidate** | Frequently updated content |
| **Network Only** | Real-time data |
| **Cache Only** | Offline-only assets |

## PWA Checklist

- [ ] Valid manifest.json with icons
- [ ] Service worker registered
- [ ] HTTPS enabled (required)
- [ ] Responsive design
- [ ] Offline fallback page
- [ ] Fast loading (<3s on 3G)
