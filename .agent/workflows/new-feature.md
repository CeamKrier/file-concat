---
description: Develop a new feature from planning to implementation
---

# New Feature Development Workflow

This workflow guides the AI agent through the complete feature development process.

## Steps

### 1. Understand the Feature Request

1. Ask the user to describe the feature they want to implement
2. Clarify any ambiguous requirements
3. Identify which packages will be affected (`apps/web`, `packages/core`, `packages/cli`)

### 2. Analyze Existing Codebase

1. Search for related code, patterns, and conventions in the project
2. Identify files that will need to be modified or created
3. Check for existing similar features that can be used as reference

### 3. Create Implementation Plan

1. Create an `implementation_plan.md` artifact with:
   - Feature description and goals
   - Proposed file changes (new files, modified files)
   - Technical approach and design decisions
   - Potential breaking changes or risks
2. Request user review of the implementation plan before proceeding

### 4. Implement the Feature

After user approval:
1. Create new files with proper structure and conventions
2. Modify existing files as outlined in the plan
3. Follow project patterns:
   - Use TypeScript with strict types
   - Use React functional components with hooks
   - Use Tailwind CSS for styling
   - Export from `@fileconcat/core` for shared logic

### 5. Verify Implementation

1. Run TypeScript type checking: `pnpm check`
2. Run linting: `pnpm lint`
3. Test the feature manually if dev server is running
4. Create a walkthrough documenting what was implemented

### 6. Final Review

1. Summarize all changes made
2. Note any follow-up tasks or TODOs
3. Suggest improvements or optimizations if applicable
