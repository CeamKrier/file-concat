import { Button } from "~/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  error: Error;
  reset?: () => void;
}

export function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <AlertTriangle className="mb-4 h-16 w-16 text-red-500" />
      <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground mb-4 max-w-md">
        {error.message || "An unexpected error occurred"}
      </p>
      {reset && (
        <Button onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}
