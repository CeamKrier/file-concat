---
name: responsive-design
description: Implement responsive layouts with mobile-first CSS, breakpoint strategies, and adaptive components. Use for any UI that needs to work across devices from mobile to desktop.
---

# Responsive Design

## When to Use This Skill

Use when:
- Building mobile-friendly interfaces
- Creating adaptive layouts
- Implementing touch vs mouse interactions
- Handling different viewport sizes

## Mobile-First Approach

### Base = Mobile, Scale Up

```css
/* Mobile (default) */
.container {
  padding: 1rem;
  flex-direction: column;
}

/* Tablet (md: 768px) */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
    flex-direction: row;
  }
}

/* Desktop (lg: 1024px) */
@media (min-width: 1024px) {
  .container {
    padding: 3rem;
    max-width: 1200px;
  }
}
```

## Tailwind CSS Breakpoints

| Prefix | Min Width | Target |
|--------|-----------|--------|
| (none) | 0px | Mobile |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large screens |

### Usage Pattern

```tsx
<div className="
  flex flex-col gap-4
  md:flex-row md:gap-6
  lg:gap-8
">
  <aside className="w-full md:w-64 lg:w-80">
    Sidebar
  </aside>
  <main className="flex-1">
    Content
  </main>
</div>
```

## useMediaQuery Hook

```tsx
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    window.matchMedia(query).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const handler = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Usage
function Component() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

## Responsive Patterns

### Stack to Row

```tsx
<div className="flex flex-col md:flex-row gap-4">
  <Card />
  <Card />
  <Card />
</div>
```

### Hidden/Shown by Breakpoint

```tsx
{/* Show only on mobile */}
<nav className="block md:hidden">
  <MobileMenu />
</nav>

{/* Show only on desktop */}
<nav className="hidden md:block">
  <DesktopMenu />
</nav>
```

### Responsive Grid

```tsx
<div className="
  grid gap-4
  grid-cols-1
  sm:grid-cols-2
  lg:grid-cols-3
  xl:grid-cols-4
">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## Touch vs Mouse

```tsx
function useInputType() {
  const [hasTouch, setHasTouch] = useState(false);

  useEffect(() => {
    setHasTouch('ontouchstart' in window);

    const handleTouch = () => setHasTouch(true);
    const handleMouse = () => setHasTouch(false);

    window.addEventListener('touchstart', handleTouch, { once: true });
    window.addEventListener('mousemove', handleMouse, { once: true });

    return () => {
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  return hasTouch ? 'touch' : 'mouse';
}
```

### Touch-Friendly Sizing

```tsx
{/* Minimum 44x44px touch targets */}
<button className="min-w-[44px] min-h-[44px] p-2">
  <Icon size={24} />
</button>
```

## Viewport Units

```css
/* Full viewport height (mobile-safe) */
.full-height {
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height - recommended */
}

/* Account for mobile browser UI */
.content {
  min-height: 100svh; /* Small viewport height */
  padding-bottom: env(safe-area-inset-bottom);
}
```

## Container Queries (Modern)

```css
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card {
    flex-direction: row;
  }
}
```

## Responsive Images

```tsx
<img
  src="/image-800.jpg"
  srcSet="
    /image-400.jpg 400w,
    /image-800.jpg 800w,
    /image-1200.jpg 1200w
  "
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  alt="Responsive image"
  loading="lazy"
/>
```

## Best Practices

1. **Mobile-first** - Start with mobile styles, add complexity for larger screens
2. **Touch targets** - Minimum 44x44px for interactive elements
3. **Avoid hover-only** - Touch devices don't have hover
4. **Test real devices** - Emulators don't catch everything
5. **Use dvh/svh** - Better than vh for mobile browsers
