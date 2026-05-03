import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { FileQuestion, Home } from "lucide-react";

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <FileQuestion className="text-muted-foreground mb-4 h-16 w-16" />
      <h1 className="mb-2 text-4xl font-bold">404</h1>
      <h2 className="text-muted-foreground mb-4 text-xl">Page Not Found</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Button asChild>
        <Link to="/">
          <Home className="mr-2 h-4 w-4" />
          Go to Home
        </Link>
      </Button>
    </div>
  );
}
