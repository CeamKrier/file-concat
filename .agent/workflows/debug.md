---
description: Debug and fix errors by analyzing root cause
---

# Debug Workflow

This workflow systematically diagnoses and fixes bugs or errors.

## Steps

### 1. Capture the Problem

Ask the user to provide:
- Error message or unexpected behavior description
- Steps to reproduce (if known)
- When did it start happening?
- Any recent changes that might be related?

### 2. Analyze Error Context

1. Parse the error message for clues:
   - File name and line number
   - Error type (TypeError, SyntaxError, etc.)
   - Stack trace analysis
2. Search codebase for the error source
3. Read the relevant files to understand context

### 3. Reproduce the Issue

1. Check if dev server is running (`pnpm dev`)
2. If TypeScript error: run `pnpm check` to see full error
3. If runtime error: analyze the component/function behavior
4. Document the exact reproduction steps

### 4. Root Cause Analysis

Investigate potential causes:
- **Type Errors**: Missing types, incorrect assertions, null/undefined values
- **Runtime Errors**: Uninitialized state, async timing, missing data
- **Build Errors**: Import issues, circular dependencies, missing packages
- **Logic Errors**: Incorrect conditions, edge cases, state management

Trace the error back to its origin:
1. Find where the problematic value originates
2. Check all transformations along the way
3. Identify the specific line causing the issue

### 5. Develop Fix

1. Create a minimal fix targeting the root cause
2. Consider edge cases and related code paths
3. Ensure fix doesn't introduce new bugs
4. If complex, create implementation plan for user review

### 6. Implement and Verify

1. Apply the fix
2. Run type checking: `pnpm check`
3. Run linting: `pnpm lint`
4. Manually verify the bug is fixed (if possible)
5. Check that related functionality still works

### 7. Document the Fix

Create a summary including:
- What was the bug?
- What caused it (root cause)?
- How was it fixed?
- Any preventive measures for the future?
