---
description: Migrate code for breaking changes or API updates
---

# Migration Workflow

This workflow handles breaking changes by finding and updating all affected code.

## Steps

### 1. Define Migration

Ask the user:
- What is being migrated? (API change, library update, pattern change)
- What's the old pattern/API?
- What's the new pattern/API?
- Any files or directories to exclude?

### 2. Analyze Impact

1. Search for all usages of the old pattern:
   - Use grep/search to find occurrences
   - Check type definitions and interfaces
   - Find both direct usage and indirect references
2. Create a list of all files that need changes
3. Categorize changes by complexity:
   - Simple: direct rename/replace
   - Medium: structural changes needed
   - Complex: logic changes required

### 3. Create Migration Plan

Document in `implementation_plan.md`:
- Summary of the breaking change
- Complete list of affected files
- Migration strategy for each file type
- Order of changes (dependencies first)
- Rollback plan if issues arise

Request user approval before proceeding.

### 4. Execute Migration

Process files in order:
1. Start with shared/core packages
2. Move to dependent applications
3. For each file:
   - Apply the transformation
   - Verify file still compiles
   - Document any edge cases

Use consistent patterns:
- If simple replacement: update all occurrences
- If complex: handle case-by-case with comments

### 5. Handle Edge Cases

For complex migrations:
1. Identify cases that don't fit the standard pattern
2. Document why they're different
3. Apply appropriate custom fix
4. Add TODO comments if further work needed

### 6. Verify Migration

1. Run full type check: `pnpm check`
2. Run linting: `pnpm lint`
3. Build all packages: `pnpm build:all`
4. Search for any remaining old patterns
5. Manually test affected features if possible

### 7. Migration Report

Create a summary:
- Total files changed
- Types of changes made
- Any remaining manual work needed
- Known issues or limitations
- Testing recommendations
