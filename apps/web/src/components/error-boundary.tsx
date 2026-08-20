import { useEffect } from "react";
import { Button } from "~/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  error: Error;
  reset?: () => void;
}

/**
 * The error message deliberately does not reach the DOM.
 *
 * Whatever renders here replaces the entire server-rendered page, so a crawler
 * that renders one of these reads its text as the page itself: Google indexed
 * "Something went wrong. Failed to fetch dynamically imported module:
 * https://fileconcat.com/assets/index-….js. Try Again." as the description for
 * fileconcat.com. The detail belongs in the console, where the person who can
 * act on it is already looking.
 *
 * The button reloads when the route cannot reset itself. A stale chunk is the
 * common case and only a fresh document fixes it.
 */
export function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <AlertTriangle className="mb-4 h-16 w-16 text-red-500" />
      <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground mb-4 max-w-md">
        This page did not finish loading. Reloading usually fixes it; the details are in your
        browser console.
      </p>
      <Button onClick={() => (reset ? reset() : window.location.reload())}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
