---
name: error-boundary
description: Implement React error boundaries and error handling patterns for graceful degradation. Use when adding crash recovery, error logging, or user-friendly error states.
---

# Error Boundary & Error Handling

## When to Use This Skill

Use when:
- Preventing full app crashes from component errors
- Showing user-friendly error messages
- Implementing error logging
- Adding retry functionality

## React Error Boundary

### Class Component (Required for Error Boundaries)

```tsx
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### Default Fallback Component

```tsx
interface ErrorFallbackProps {
  error: Error | null;
  resetError?: () => void;
}

function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div role="alert" className="p-4 border border-red-500 rounded">
      <h2 className="text-lg font-semibold text-red-600">
        Something went wrong
      </h2>
      <p className="text-gray-600 mt-2">
        {error?.message || 'An unexpected error occurred'}
      </p>
      {resetError && (
        <button
          onClick={resetError}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
        >
          Try again
        </button>
      )}
    </div>
  );
}
```

## Error Boundary with Reset

```tsx
function ResettableErrorBoundary({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState(0);

  const handleReset = () => setKey(prev => prev + 1);

  return (
    <ErrorBoundary
      key={key}
      fallback={<ErrorFallback resetError={handleReset} />}
    >
      {children}
    </ErrorBoundary>
  );
}
```

## Async Error Handling

### useAsyncError Hook

```tsx
function useAsyncError() {
  const [, setError] = useState();

  return useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}

// Usage in components
function AsyncComponent() {
  const throwError = useAsyncError();

  useEffect(() => {
    fetchData().catch(throwError);
  }, [throwError]);
}
```

### Safe Async Handler

```tsx
function useSafeAsync<T>() {
  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    loading: boolean;
  }>({
    data: null,
    error: null,
    loading: false
  });

  const execute = useCallback(async (asyncFn: () => Promise<T>) => {
    setState({ data: null, error: null, loading: true });

    try {
      const data = await asyncFn();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ data: null, error: err, loading: false });
      throw err;
    }
  }, []);

  return { ...state, execute };
}
```

## Error Logging

```typescript
function logError(error: Error, context?: Record<string, unknown>): void {
  const errorReport = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    ...context
  };

  // Log to console in development
  if (import.meta.env.DEV) {
    console.error('Error Report:', errorReport);
  }

  // Send to error tracking service in production
  if (import.meta.env.PROD) {
    // navigator.sendBeacon('/api/errors', JSON.stringify(errorReport));
  }
}
```

## Global Error Handler

```tsx
// main.tsx or App.tsx
useEffect(() => {
  const handleError = (event: ErrorEvent) => {
    logError(event.error || new Error(event.message));
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    logError(
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason))
    );
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}, []);
```

## Error Boundary Placement

```tsx
function App() {
  return (
    <ErrorBoundary fallback={<FullPageError />}>
      <Layout>
        <ErrorBoundary fallback={<SidebarError />}>
          <Sidebar />
        </ErrorBoundary>

        <ErrorBoundary fallback={<ContentError />}>
          <MainContent />
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  );
}
```

## Best Practices

1. **Wrap at feature boundaries** - Don't let one feature crash others
2. **Provide recovery options** - Reset buttons, retry mechanisms
3. **Log contextual info** - Component stack, user actions
4. **Show helpful messages** - What went wrong, what user can do
5. **Don't catch in render** - Error boundaries only catch render errors
