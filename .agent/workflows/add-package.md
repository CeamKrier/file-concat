---
description: Add a new package to the monorepo with proper configuration
---

# Add Package Workflow

This workflow creates a new package in the monorepo with all necessary configuration files.

## Steps

### 1. Gather Package Information

Ask the user:
- **Package name**: What should the package be called? (e.g., `@fileconcat/utils`)
- **Package type**: Library, CLI tool, or application?
- **Purpose**: What functionality will this package provide?
- **Dependencies**: Will it depend on other workspace packages?

### 2. Create Package Structure

Based on package type, create the directory structure:

**For a library package:**
```
packages/{name}/
├── src/
│   └── index.ts
├── package.json
└── tsconfig.json
```

**For a CLI package:**
```
packages/{name}/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### 3. Create package.json

Generate `package.json` with:
- Proper name following `@fileconcat/{name}` convention
- Version starting at `1.0.0`
- Type: `"module"`
- Exports configuration
- Scripts: `check`, `build` (if applicable)
- Workspace dependencies: `"workspace:*"`

### 4. Create tsconfig.json

Create TypeScript config extending root:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### 5. Create Initial Source Files

1. Create `src/index.ts` with barrel exports
2. Add placeholder types and functions based on purpose
3. Add JSDoc comments for documentation

### 6. Update Workspace

1. Verify package is discovered by pnpm workspace
2. Run `pnpm install` to link the new package
3. Update root `tsconfig.json` references if needed

### 7. Verify Setup

1. Run `pnpm check` from new package directory
2. Verify package can be imported from other packages
3. Document the package purpose in its README.md
