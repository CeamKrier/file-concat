---
description: Analyze workspace and create effective rules for AI agent guidance
---

# Create Rules Workflow

This workflow analyzes the current workspace and generates effective rules to guide the AI agent.

## Steps

### 1. Analyze Project Structure

1. Examine the workspace structure:
   - Root configuration files (`package.json`, `tsconfig.json`, etc.)
   - Directory organization (`apps/`, `packages/`, etc.)
   - Build tools and frameworks in use

2. Identify technology stack:
   - Language (TypeScript, JavaScript)
   - Frameworks (React, Vite, Next.js)
   - Styling (Tailwind, CSS Modules)
   - Testing frameworks (if any)

### 2. Identify Coding Patterns

1. Search for existing conventions:
   - Component structure and naming
   - File and folder naming conventions
   - Import/export patterns
   - Type definition patterns

2. Analyze code style:
   - ESLint configuration
   - Prettier configuration
   - TypeScript strictness settings

### 3. Determine Rule Categories

Create rules for the following areas:

**Code Style & Conventions:**
- Naming conventions (files, components, functions, types)
- Import ordering and aliasing
- Component structure patterns

**Project-Specific Guidelines:**
- Monorepo structure rules (workspace dependencies)
- Package responsibilities (`core` vs `web` vs `cli`)
- Shared code locations

**Technology Constraints:**
- Version requirements
- Forbidden patterns or libraries
- Required patterns for consistency

**AI Behavior:**
- When to ask for clarification
- Preferred approach for ambiguous situations
- Error handling expectations

### 4. Create workspace-rules.md

Generate the rules file at `.agent/rules/workspace-rules.md`:

```markdown
---
trigger: always_on
glob:
description: Core workspace rules for FileConcat project
---

## Project Overview
[Brief description of the project purpose]

## Tech Stack
[List of technologies and versions]

## Coding Conventions
[Naming, structure, patterns]

## Package Guidelines
[Rules for each package/app]

## Important Constraints
[Things to avoid, requirements]
```

### 5. Verify and Review

1. Check that rules are specific enough to be actionable
2. Ensure rules don't conflict with each other
3. Verify rules align with existing codebase patterns
4. Present rules to user for review and adjustment
