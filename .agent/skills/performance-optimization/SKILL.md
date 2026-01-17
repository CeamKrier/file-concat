---
name: performance-optimization
description: Optimize React application performance with lazy loading, code splitting, memoization, and virtualization. Use when addressing slow renders, large bundles, or memory issues.
---

# Performance Optimization

## When to Use This Skill

Use when:
- Initial load time is too slow
- Components re-render unnecessarily
- Rendering large lists or data sets
- Bundle size is too large
- Memory usage is high

## Code Splitting & Lazy Loading

### React.lazy for Route-based Splitting

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Named Exports with Lazy

```tsx
// For components not using default export
const LazyComponent = lazy(() =>
  import('./components').then(module => ({
    default: module.SpecificComponent
  }))
);
```

### Preloading on Hover

```tsx
const DashboardLazy = lazy(() => import('./Dashboard'));

function NavLink() {
  const preload = () => {
    import('./Dashboard'); // Starts loading on hover
  };

  return (
    <Link to="/dashboard" onMouseEnter={preload}>
      Dashboard
    </Link>
  );
}
```

## Memoization

### React.memo for Components

```tsx
interface ExpensiveComponentProps {
  data: Data;
  onAction: (id: string) => void;
}

// Only re-renders when props change (shallow comparison)
export const ExpensiveComponent = React.memo(
  function ExpensiveComponent({ data, onAction }: ExpensiveComponentProps) {
    return <div>{/* expensive render */}</div>;
  }
);

// With custom comparison
export const CustomMemoComponent = React.memo(
  ExpensiveComponent,
  (prevProps, nextProps) => {
    return prevProps.data.id === nextProps.data.id;
  }
);
```

### useMemo for Expensive Calculations

```tsx
function DataProcessor({ items, filter }: Props) {
  // Only recalculates when items or filter change
  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name.includes(filter)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filter]);

  return <List items={filteredItems} />;
}
```

### useCallback for Stable References

```tsx
function Parent({ items }: Props) {
  // Stable reference, doesn't change between renders
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []); // Empty deps = never changes

  return (
    <>
      {items.map(item => (
        <MemoizedChild
          key={item.id}
          onClick={handleClick}
        />
      ))}
    </>
  );
}
```

## List Virtualization

### Using react-window

```tsx
import { FixedSizeList } from 'react-window';

interface ItemData {
  items: Item[];
  onSelect: (id: string) => void;
}

function VirtualList({ items, onSelect }: ItemData) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style} onClick={() => onSelect(items[index].id)}>
      {items[index].name}
    </div>
  );

  return (
    <FixedSizeList
      height={400}
      width="100%"
      itemCount={items.length}
      itemSize={50}
    >
      {Row}
    </FixedSizeList>
  );
}
```

## Debouncing & Throttling

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      search(debouncedQuery);
    }
  }, [debouncedQuery]);
}
```

## Bundle Analysis

```bash
# Vite
npx vite-bundle-visualizer

# Webpack
npx webpack-bundle-analyzer stats.json
```

## Performance Checklist

- [ ] Use React.lazy for route-level code splitting
- [ ] Wrap expensive components with React.memo
- [ ] Use useMemo for expensive calculations
- [ ] Use useCallback for callback props passed to memoized children
- [ ] Virtualize lists with >100 items
- [ ] Debounce input handlers
- [ ] Lazy load images below the fold
- [ ] Split vendor chunks from app code
