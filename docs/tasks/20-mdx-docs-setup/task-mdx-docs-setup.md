# Task 20: MDX Documentation Setup

## Ozet

TanStack Start ile MDX destegi ekleyip documentation sayfalarini olustur.

## Oncelik

Dusuk (Faz 5 - Documentation)

## Bagimliliklari

- Faz 1: TanStack Start Migration (tamamlanmis)

## Basari Kriterleri

- [ ] MDX dosyalari render ediliyor
- [ ] `/docs` route'u calisiyor
- [ ] Docs navigation calisiyor
- [ ] Code syntax highlighting calisiyor
- [ ] Responsive layout

## Detayli Adimlar

### 1. MDX Dependencies Ekleme

```bash
cd apps/web
pnpm add @mdx-js/rollup @mdx-js/react remark-gfm rehype-prism-plus
pnpm add -D @types/mdx
```

### 2. Vite Config Guncelleme

**Dosya:** `apps/web/vite.config.ts`

```typescript
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypePrismPlus from "rehype-prism-plus";

export default defineConfig({
  plugins: [
    // ... existing plugins
    mdx({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypePrismPlus],
      providerImportSource: "@mdx-js/react",
    }),
    // ... rest of plugins
  ],
  // ...
});
```

### 3. MDX Provider Setup

**Dosya:** `apps/web/src/components/mdx-provider.tsx` (yeni)

```tsx
import { MDXProvider } from "@mdx-js/react";
import type { ComponentProps, ReactNode } from "react";

// Custom components for MDX
const components = {
  h1: (props: ComponentProps<"h1">) => <h1 className="mb-4 mt-8 text-3xl font-bold" {...props} />,
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mb-3 mt-6 text-2xl font-semibold" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-4 text-xl font-semibold" {...props} />
  ),
  p: (props: ComponentProps<"p">) => <p className="mb-4 leading-7" {...props} />,
  ul: (props: ComponentProps<"ul">) => <ul className="mb-4 ml-6 list-disc space-y-2" {...props} />,
  ol: (props: ComponentProps<"ol">) => (
    <ol className="mb-4 ml-6 list-decimal space-y-2" {...props} />
  ),
  li: (props: ComponentProps<"li">) => <li className="leading-7" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-blue-600 hover:underline dark:text-blue-400"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  code: (props: ComponentProps<"code">) => {
    // Inline code
    if (!props.className) {
      return <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm" {...props} />;
    }
    // Code block (handled by pre)
    return <code {...props} />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm dark:bg-gray-950"
      {...props}
    />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="text-muted-foreground mb-4 border-l-4 border-blue-500 pl-4 italic"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse" {...props} />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="border-border bg-muted border px-4 py-2 text-left font-semibold" {...props} />
  ),
  td: (props: ComponentProps<"td">) => <td className="border-border border px-4 py-2" {...props} />,
  hr: () => <hr className="border-border my-8" />,
};

interface MDXProviderWrapperProps {
  children: ReactNode;
}

export function MDXProviderWrapper({ children }: MDXProviderWrapperProps) {
  return <MDXProvider components={components}>{children}</MDXProvider>;
}
```

### 4. Docs Layout Component

**Dosya:** `apps/web/src/components/docs-layout.tsx` (yeni)

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Home, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { MDXProviderWrapper } from "~/components/mdx-provider";
import { cn } from "~/lib/utils";

interface DocLink {
  title: string;
  href: string;
}

interface DocSection {
  title: string;
  links: DocLink[];
}

const DOCS_NAVIGATION: DocSection[] = [
  {
    title: "Getting Started",
    links: [
      { title: "Introduction", href: "/docs" },
      { title: "Quick Start", href: "/docs/quick-start" },
    ],
  },
  {
    title: "Features",
    links: [
      { title: "File Filtering", href: "/docs/file-filtering" },
      { title: "GitHub Import", href: "/docs/github-import" },
      { title: "GitLab Import", href: "/docs/gitlab-import" },
      { title: "Token Estimation", href: "/docs/token-estimation" },
    ],
  },
  {
    title: "Advanced",
    links: [
      { title: "CLI Usage", href: "/docs/cli-usage" },
      { title: "Configuration", href: "/docs/configuration" },
    ],
  },
];

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          "bg-background fixed inset-y-0 left-0 z-40 w-64 transform border-r transition-transform duration-200 md:relative md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Home className="h-4 w-4" />
            FileConcat
          </Link>
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <nav className="p-4">
            {DOCS_NAVIGATION.map((section) => (
              <div key={section.title} className="mb-6">
                <h4 className="text-muted-foreground mb-2 text-sm font-semibold">
                  {section.title}
                </h4>
                <ul className="space-y-1">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        to={link.href}
                        className={cn(
                          "hover:bg-accent flex items-center rounded-md px-2 py-1.5 text-sm",
                          location.pathname === link.href && "bg-accent font-medium",
                        )}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <ChevronRight className="mr-1 h-3 w-3" />
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
          <MDXProviderWrapper>{children}</MDXProviderWrapper>
        </div>
      </main>
    </div>
  );
}
```

### 5. Docs Route

**Dosya:** `apps/web/src/routes/docs/index.tsx` (yeni)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DocsLayout } from "~/components/docs-layout";

// Import MDX content
import IntroductionMdx from "~/content/docs/introduction.mdx";

export const Route = createFileRoute("/docs/")({
  component: DocsIndexPage,
  head: () => ({
    meta: [
      { title: "Documentation - FileConcat" },
      {
        name: "description",
        content: "Learn how to use FileConcat to combine files for AI assistants.",
      },
    ],
  }),
});

function DocsIndexPage() {
  return (
    <DocsLayout>
      <IntroductionMdx />
    </DocsLayout>
  );
}
```

### 6. Dynamic Docs Route

**Dosya:** `apps/web/src/routes/docs/$slug.tsx` (yeni)

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "~/components/docs-layout";
import { lazy, Suspense } from "react";

// Lazy load MDX files
const docsModules = import.meta.glob("~/content/docs/*.mdx");

export const Route = createFileRoute("/docs/$slug")({
  component: DocsPage,
  loader: async ({ params }) => {
    const modulePath = `~/content/docs/${params.slug}.mdx`;
    if (!docsModules[modulePath]) {
      throw notFound();
    }
    return { slug: params.slug };
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug.replace(/-/g, " ")} - FileConcat Docs` }],
  }),
});

function DocsPage() {
  const { slug } = Route.useParams();

  const Content = lazy(() =>
    import(`~/content/docs/${slug}.mdx`).then((mod) => ({
      default: mod.default,
    })),
  );

  return (
    <DocsLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <Content />
      </Suspense>
    </DocsLayout>
  );
}
```

### 7. Content Klasoru ve Ornek MDX

**Dosya:** `apps/web/src/content/docs/introduction.mdx` (yeni)

```mdx
# Introduction to FileConcat

FileConcat is a free, open-source tool for combining multiple files into a single document optimized for AI assistants like ChatGPT, Claude, and Gemini.

## Why FileConcat?

When working with AI assistants, you often need to share code or documentation for analysis. Copy-pasting individual files is tedious and loses context. FileConcat solves this by:

- **Combining files** into a structured format
- **Preserving context** with file tree visualization
- **Optimizing output** for LLM comprehension
- **Processing offline** for complete privacy

## Key Features

### 100% Offline Processing

All file processing happens in your browser. Your files never leave your device, ensuring complete privacy.

### Smart Token Estimation

Real-time token counting using the same tokenizer as OpenAI models. Know exactly how much of your LLM's context window you're using.

### Multiple Input Sources

Import files from:

- Local files (drag & drop or file picker)
- GitHub repositories
- GitLab repositories
- Bitbucket repositories
- GitHub Gists
- Any public URL

### Intelligent Filtering

Use glob patterns to include or exclude specific files. Quick presets available for popular tech stacks like React, Vue, Python, and more.

## Getting Started

1. Visit [fileconcat.com](https://fileconcat.com)
2. Drag & drop your files or import from a repository
3. Configure filters if needed
4. Copy or download the combined output
5. Paste into your AI assistant

Ready to try it? [Go to the app](/) or continue reading the [Quick Start](/docs/quick-start) guide.
```

**Dosya:** `apps/web/src/content/docs/quick-start.mdx` (yeni)

```mdx
# Quick Start

Get started with FileConcat in under a minute.

## Option 1: Local Files

1. Open [fileconcat.com](https://fileconcat.com)
2. Drag and drop your project folder onto the upload area
3. Review the file list and toggle any files you want to exclude
4. Click "Copy" to copy the output to your clipboard
5. Paste into ChatGPT, Claude, or your preferred AI assistant

## Option 2: GitHub Repository

1. Copy your GitHub repository URL
2. Paste it into the repository input field
3. Click "Fetch Files"
4. Wait for the download to complete
5. Copy or download the combined output

## Supported URL Formats
```

# Basic repository

https://github.com/owner/repo

# Specific branch

https://github.com/owner/repo/tree/develop

# Subdirectory

https://github.com/owner/repo/tree/main/packages/core

```

## Tips

- Use the **Settings** panel to configure include/ignore patterns
- Use **Presets** for quick configuration of common tech stacks
- Check the **token count** to ensure your content fits the AI's context window
- Use **Multiple Files** output for very large projects

## Next Steps

- Learn about [File Filtering](/docs/file-filtering)
- Explore [Token Estimation](/docs/token-estimation)
- Try the [CLI Tool](/docs/cli-usage)
```

### 8. TypeScript Config Guncelleme

**Dosya:** `apps/web/tsconfig.json`

```json
{
  "compilerOptions": {
    // ... existing
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.mdx"]
}
```

## Test Etme

```bash
cd apps/web
pnpm dev

# Test checklist:
# [ ] /docs sayfasi yukleniyor
# [ ] Sidebar navigation calisiyor
# [ ] /docs/quick-start sayfasi yukleniyor
# [ ] Code highlighting calisiyor
# [ ] Mobile responsive calisiyor
# [ ] Links calisiyor
```

## Notlar

- MDX dosyalari `src/content/docs/` altinda
- Dynamic import ile lazy loading
- Prism.js ile syntax highlighting
- Tailwind typography styles

## Rollback

```bash
rm -rf apps/web/src/content
rm apps/web/src/components/mdx-provider.tsx
rm apps/web/src/components/docs-layout.tsx
rm -rf apps/web/src/routes/docs
# vite.config.ts'ten mdx plugin kaldir
# dependencies kaldir
```
