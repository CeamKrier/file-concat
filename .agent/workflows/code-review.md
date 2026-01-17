---
description: Analyze code for bugs, issues, and improvement opportunities
---

# Code Review Workflow

This workflow performs an automated code review to find potential issues and suggest improvements.

## Steps

### 1. Determine Scope

Ask the user:
- Which files or directories should be reviewed?
- Any specific concerns (performance, security, maintainability)?
- Focus area: bug hunting, code quality, or both?

### 2. Analyze Code Structure

1. Read the target files and understand their purpose
2. Check for proper TypeScript typing and type safety
3. Verify React best practices (hooks usage, component structure)
4. Look for code duplication across similar files

### 3. Identify Potential Issues

Check for common problems:
- **Type Safety**: `any` types, missing null checks, unsafe type assertions
- **React Issues**: Missing dependencies in useEffect, unnecessary re-renders
- **Error Handling**: Unhandled promise rejections, missing try-catch
- **Performance**: Large bundle imports, missing memoization, expensive computations
- **Security**: XSS vulnerabilities, unsafe data handling
- **Maintainability**: Complex functions, magic numbers, unclear naming

### 4. Run Automated Checks

1. Run TypeScript checking: `pnpm check`
2. Run ESLint: `pnpm lint`
3. Report any errors or warnings found

### 5. Generate Review Report

Create a structured report including:
- 🔴 **Critical Issues**: Bugs, security problems, breaking code
- 🟡 **Warnings**: Performance issues, code smells, potential bugs
- 🟢 **Suggestions**: Improvements, optimizations, refactoring opportunities
- 📝 **Notes**: Observations, patterns, architectural concerns

For each issue provide:
- File and line location
- Description of the problem
- Suggested fix with code example

### 6. Offer to Fix Issues

Ask the user if they want the agent to:
1. Fix critical issues automatically
2. Implement suggested improvements
3. Create a detailed TODO list for manual fixes
