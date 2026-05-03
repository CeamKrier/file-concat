# Task 05: Static Pages (About, 404)

## Ozet

SEO icin statik sayfalar olustur: About sayfasi ve 404 Not Found sayfasi.

## Oncelik

Yuksek (Faz 1 - Migration)

## Bagimliliklari

- Task 04: Index Route (tamamlanmis)

## Basari Kriterleri

- [ ] `/about` sayfasi calisiyor
- [ ] 404 sayfasi calisiyor
- [ ] Her sayfanin kendi meta tags'i var
- [ ] Navigation linkleri calisiyor

## Detayli Adimlar

### 1. About Page Olusturma

**Dosya:** `apps/web/src/routes/about.tsx` (yeni)

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Shield, Github, Zap, Code2, FileText, Terminal, ArrowLeft } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About FileConcat - Open Source File Concatenation Tool" },
      {
        name: "description",
        content:
          "FileConcat is a free, open-source tool for combining multiple files into a single document optimized for AI assistants. Learn about features, privacy, and how it works.",
      },
    ],
    links: [{ rel: "canonical", href: "https://fileconcat.com/about" }],
  }),
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Back Navigation */}
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to App
          </Link>
        </Button>
      </div>

      {/* Hero Section */}
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <img src="/logo.png" alt="FileConcat Logo" className="h-12 w-12 dark:hidden" />
          <img src="/dark-logo.png" alt="FileConcat Logo" className="hidden h-12 w-12 dark:block" />
          <h1 className="text-4xl font-bold">FileConcat</h1>
        </div>
        <p className="text-muted-foreground text-xl">
          Combine files for AI assistants like ChatGPT, Claude, and Gemini
        </p>
      </div>

      {/* Features Grid */}
      <div className="mb-12 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              100% Offline & Private
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              All file processing happens entirely in your browser. Your files never leave your
              device - no data is sent to any server.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Smart Token Estimation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Real-time token counting using the same tokenizer as OpenAI models. See exactly how
              much of your LLM's context window you're using.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-blue-500" />
              Multiple Input Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Import files via drag & drop, file picker, or directly from GitHub, GitLab, and
              Bitbucket repositories. Support for Gists and raw URLs too.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              LLM-Optimized Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Generates well-structured output with file tree visualization, proper code fencing,
              and language identifiers for optimal AI comprehension.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-orange-500" />
              CLI Tool Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Prefer the command line? Install our CLI tool via npm for quick file concatenation
              directly from your terminal.
            </p>
            <pre className="bg-muted mt-2 rounded p-2 text-sm">
              <code>npx fileconcat ./src</code>
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Open Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              FileConcat is completely open source. Contribute, report issues, or fork it for your
              own needs.
            </p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <a
                href="https://github.com/CeamKrier/file-concat"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiGithub className="mr-2 h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-muted-foreground list-inside list-decimal space-y-3">
            <li>
              <strong>Upload files</strong> - Drag & drop files/folders, use the file picker, or
              import from a Git repository
            </li>
            <li>
              <strong>Configure filters</strong> - Use glob patterns to include/exclude specific
              files, or choose from preset configurations for popular tech stacks
            </li>
            <li>
              <strong>Review & edit</strong> - Preview file contents, toggle individual files, and
              make edits if needed
            </li>
            <li>
              <strong>Export</strong> - Copy to clipboard or download as a single file (or multiple
              chunks for large projects)
            </li>
            <li>
              <strong>Paste into your AI</strong> - The output is optimized for LLM comprehension
              with proper structure and context
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Use Cases */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle>Use Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground list-inside list-disc space-y-2">
            <li>Share your entire codebase with an AI for code review or debugging</li>
            <li>Provide context about your project structure for architecture discussions</li>
            <li>Create documentation by letting AI analyze your code</li>
            <li>Get help with refactoring by sharing related files together</li>
            <li>Onboard AI assistants to your project quickly</li>
          </ul>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-muted-foreground text-center text-sm">
        <p>
          Made with care by{" "}
          <a
            href="https://twitter.com/CeamKrier"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            @CeamKrier
          </a>
        </p>
      </div>
    </div>
  );
}
```

### 2. Not Found (404) Component Olusturma

**Dosya:** `apps/web/src/components/not-found.tsx` (yeni)

```tsx
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
```

### 3. Root Route'a Not Found Ekleme

**Dosya:** `apps/web/src/routes/__root.tsx`

NotFoundComponent'i ekle:

```tsx
import { NotFound } from "~/components/not-found";

export const Route = createRootRoute({
  // ... mevcut head config
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});
```

### 4. Error Boundary Component (Opsiyonel)

**Dosya:** `apps/web/src/components/error-boundary.tsx` (yeni)

```tsx
import { useRouterState } from "@tanstack/react-router";
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
```

### 5. Root Route'a Error Boundary Ekleme

```tsx
import { ErrorBoundary } from "~/components/error-boundary";

export const Route = createRootRoute({
  // ... mevcut config
  errorComponent: ({ error, reset }) => <ErrorBoundary error={error} reset={reset} />,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});
```

## Test Etme

```bash
cd apps/web

# Route tree regenerate
pnpm tanstack-router generate

# Dev server
pnpm dev

# Test checklist:
# [ ] http://localhost:3000/about yukleniyor
# [ ] http://localhost:3000/nonexistent 404 gosteriyor
# [ ] About sayfasindan ana sayfaya donulebiliyor
# [ ] Meta tags dogru (View Source)
```

## Notlar

- About sayfasi statik content, SEO icin onemli
- 404 sayfasi user experience icin onemli
- Error boundary production'da hatalari yakalar

## Rollback

```bash
rm apps/web/src/routes/about.tsx
rm apps/web/src/components/not-found.tsx
rm apps/web/src/components/error-boundary.tsx
# __root.tsx'ten notFoundComponent ve errorComponent kaldir
```
