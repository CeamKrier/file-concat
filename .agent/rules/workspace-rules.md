---
trigger: always_on
glob:
description: Core workspace rules for FileConcat project
---

## Project Overview

FileConcat is a privacy-first file concatenation tool for AI assistants. It processes files entirely in the browser - no server uploads. The project is a pnpm/Nx monorepo with web, CLI, and core packages.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.6+ (strict mode) |
| Web Framework | React 18 + Vite |
| Styling | Tailwind CSS 3.x |
| UI Components | shadcn/ui pattern (Radix primitives) |
| Icons | lucide-react |
| Build (web) | Vite |
| Build (CLI) | tsup |
| Monorepo | pnpm workspaces + Nx |
| Token Counting | @dqbd/tiktoken |

## Package Responsibilities

### `@fileconcat/core` (packages/core)
- **Purpose**: Shared business logic, types, and utilities
- **Contents**: Types, constants, file processing, path utilities, default ignore patterns
- **Usage**: Import via `@fileconcat/core` or `@fileconcat/core/*`
- **No build step**: Source TypeScript consumed directly

### `@fileconcat/web` (apps/web)
- **Purpose**: Browser-based web application
- **Styling**: Tailwind CSS only
- **State**: React hooks, no external state library
- **Components**: Feature components + shadcn/ui primitives

### `fileconcat` CLI (packages/cli)
- **Purpose**: Command-line tool for file concatenation
- **Framework**: commander.js for CLI parsing
- **Build**: tsup to single ESM bundle


## Coding Conventions

### File Naming
- **Components**: `kebab-case.tsx` (e.g., `file-tree.tsx`, `theme-toggle.tsx`)
- **Hooks**: `use-{name}.ts` in `hooks/` directory (e.g., `use-config.ts`)
- **Types**: `types.ts` or inline in relevant file
- **Utilities**: `kebab-case.ts` (e.g., `default-ignore.ts`)

### Component Structure
```tsx
// 1. External imports
import { SomeIcon } from "lucide-react";

// 2. Internal imports (UI components first)
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

// 3. Interface definition (suffix with Props)
interface ComponentNameProps {
  className?: string;
  children?: React.ReactNode;
}

// 4. Named export function component
export function ComponentName({ className, children }: ComponentNameProps) {
  // hooks first
  const { theme } = useTheme();

  return (
    <div className={cn("base-classes", className)}>
      {children}
    </div>
  );
}
```

### Export Patterns
- **Named exports only** - no default exports
- **Barrel exports** in `index.ts` for packages
- **Re-exports** with `export * from './module'`

### Import Aliases
- `@/` → `apps/web/src/`
- `@fileconcat/core` → `packages/core/src/index.ts`

### Type Definitions
- Use `type` for object shapes: `type FileEntry = { ... }`
- Use `interface` for extensible contracts: `interface GitHubFile { ... }`
- Suffix prop types with `Props`: `ComponentNameProps`
- Version config types: `version: 2` for localStorage schemas

## UI Components (shadcn/ui Pattern)

Located in `apps/web/src/components/ui/`:
- Copy-paste pattern from shadcn/ui
- Use `cn()` utility for class merging (from `@/lib/utils`)
- Wrap Radix primitives with Tailwind styling
- Forward refs when needed for accessibility

## Important Constraints

### DO
- Keep all file processing client-side (privacy-first)
- Use strict TypeScript (`strict: true`)
- Run `pnpm check` before committing
- Use `pnpm lint` and `pnpm format`
- Place shared logic in `@fileconcat/core`

### DON'T
- Don't use `any` type - find proper types
- Don't use default exports
- Don't add server-side functionality to web app
- Don't import from relative paths across packages (use workspace aliases)
- Don't use CSS modules or styled-components (Tailwind only)

## AI Agent Guidelines

### When to Ask for Clarification
- Ambiguous feature scope or design decisions
- Breaking changes to existing APIs or types
- Adding new dependencies to the project
- Changes affecting multiple packages

### Preferred Approaches
- Incremental changes with verification at each step
- Type-first development (define types before implementation)
- Reuse existing patterns from the codebase
- Check for similar existing code before creating new

### Error Handling
- Always handle async errors with try-catch
- Provide meaningful error messages for users
- Log errors appropriately for debugging
