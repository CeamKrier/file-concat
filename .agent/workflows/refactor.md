---
description: Systematically refactor code for better quality and maintainability
---

# Refactoring Workflow

This workflow guides systematic code refactoring with safety checks at each step.

## Steps

### 1. Define Refactoring Goals

Ask the user:
- What code needs refactoring? (specific files, components, or patterns)
- What's the goal? (readability, performance, DRY, type safety, modernization)
- Are there any constraints? (preserve API, backwards compatibility)

### 2. Analyze Current State

1. Read and understand the target code thoroughly
2. Identify all usages and dependencies of the code
3. Document the current behavior and interface
4. Check if there are tests covering this code

### 3. Create Refactoring Plan

Create an `implementation_plan.md` with:
- Current state analysis
- Proposed changes with rationale
- Risk assessment (what could break)
- Step-by-step refactoring order to minimize breakage

Request user approval before proceeding.

### 4. Execute Refactoring (Incremental)

For each refactoring step:
1. Make a single, focused change
2. Verify TypeScript compiles: `pnpm check`
3. Only proceed to next step if previous succeeds

Common refactoring patterns:
- **Extract Component**: Move JSX into a new component file
- **Extract Hook**: Move stateful logic into a custom hook
- **Extract Utility**: Move pure functions to `@fileconcat/core`
- **Rename**: Update names across all usages
- **Simplify**: Reduce complexity, flatten nesting
- **Type Improvement**: Replace `any` with proper types

### 5. Verify Refactoring

1. Run full type check: `pnpm check`
2. Run linting: `pnpm lint`
3. Manually verify behavior if dev server is running
4. Compare before/after to ensure functionality is preserved

### 6. Document Changes

Create a walkthrough showing:
- What was changed and why
- Before/after code comparisons
- Any behavior changes (should be none for pure refactoring)
- Follow-up opportunities identified
