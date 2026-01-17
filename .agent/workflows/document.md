---
description: Generate and update code documentation
---

# Documentation Workflow

This workflow creates comprehensive documentation for code and features.

## Steps

### 1. Determine Documentation Scope

Ask the user:
- What needs documentation? (specific files, features, APIs, entire package)
- Documentation type: API docs, usage guide, inline comments, or README?
- Target audience: developers, end users, or contributors?

### 2. Analyze Code for Documentation

1. Read target files and understand their purpose
2. Identify public APIs, exports, and interfaces
3. Trace function usage across the codebase
4. Note complex logic that needs explanation

### 3. Generate JSDoc/TSDoc Comments

For each public function, class, and interface:
```typescript
/**
 * Brief description of what this does.
 *
 * @param paramName - Description of parameter
 * @returns Description of return value
 * @throws Error condition if applicable
 * @example
 * ```ts
 * const result = functionName(value);
 * ```
 */
```

Ensure:
- All exported functions have JSDoc
- All interfaces have property descriptions
- Complex types have usage examples

### 4. Update Package README

For each documented package, ensure README.md includes:
- Package purpose and features
- Installation instructions
- Quick start / usage examples
- API reference (for libraries)
- Configuration options

### 5. Update Root README (if needed)

If changes affect the overall project:
- Update feature list
- Update architecture description
- Add new usage examples

### 6. Verify Documentation

1. Check that all public APIs are documented
2. Verify code examples are accurate and runnable
3. Ensure no outdated documentation remains
4. Check for consistency in style and formatting

### 7. Documentation Report

Summarize:
- Files documented
- Coverage improvements
- Remaining documentation gaps
- Suggested follow-ups
