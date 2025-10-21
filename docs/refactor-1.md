Collecting workspace information# Implementation Specification: File Tree Fixes and GitHub URL Support

## Overview

This document outlines the changes needed to fix file tree inclusion/exclusion issues and add support for GitHub repository branches and sub-paths.

## Problem 1: File Tree Include/Exclude Issues

### Current Issue

Files that are excluded in the file tree are still being included in the concatenated output. The inclusion state is not being properly propagated to the final output generation.

### Root Cause Analysis

Looking at the code flow:

1. `toggleFileInclusion` and `toggleMultipleFiles` update `fileStatuses` state
2. These functions reprocess files and update `processedContents`
3. However, `generateOutput` uses `processedContents` directly without re-checking current `fileStatuses`

### Solution

#### Step 1: Fix Output Generation

Modify `generateOutput` function to filter `processedContents` based on current `fileStatuses`:

```typescript
// In generateOutput function
const includedContents = processedContents.filter((content, index) => {
  // Find matching file status by path
  const status = fileStatuses.find((s) => s.path === content.path);
  return status?.included ?? false;
});
```

#### Step 2: Ensure Path Matching Consistency

Update `FileStatus` to always include an index for reliable matching:

```typescript
export type FileStatus = {
  path: string;
  included: boolean;
  reason?: string;
  size: number;
  type: string;
  forceInclude?: boolean;
  skipped?: boolean;
  skipReason?: string;
  index: number; // Make required instead of optional
};
```

#### Step 3: Add Validation

Add a validation function to ensure `processedContents` and `fileStatuses` are in sync:

```typescript
const validateContentStatusSync = useCallback(() => {
  if (processedContents.length !== fileStatuses.filter((s) => s.included).length) {
    console.warn("Content and status out of sync");
  }
}, [processedContents, fileStatuses]);
```

## Problem 2: GitHub Branch and Sub-Path Support

### Current Limitation

The `fetchGithubRepository` function only supports root repository URLs:

- ✅ `https://github.com/owner/repo`
- ❌ `https://github.com/owner/repo/tree/branch`
- ❌ `https://github.com/owner/repo/tree/branch/path/to/folder`
- ❌ `https://github.com/owner/repo/tree/commit-sha/path`

### Requirements

1. **Branch Support**: Accept URLs with `/tree/{branch}` format
2. **Sub-Path Support**: Accept URLs with `/tree/{branch}/{path}` format
3. **Commit SHA Support**: Accept URLs with `/tree/{commit-sha}/{path}` format
4. **Backward Compatibility**: Continue supporting root repository URLs

### Solution

#### Step 1: Update URL Parsing

Modify the URL regex in `fetchGithubRepository`:

```typescript
// Current regex
const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/?/);

// New regex to support branch and path
const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
```

This captures:

- Group 1: owner
- Group 2: repo
- Group 3: branch/commit (optional)
- Group 4: sub-path (optional)

#### Step 2: Update Repository Fetching Logic

```typescript
const [, owner, repo, branchOrCommit, subPath] = match;

// Determine branch to use
const branch = branchOrCommit || defaultBranch;

// Get tree with specified branch
const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

// Filter files by sub-path if provided
const files = treeData.tree.filter((item: { type: string; path: string }) => {
  if (item.type !== "blob") return false;
  if (!subPath) return true;
  return item.path.startsWith(subPath + "/") || item.path === subPath;
});
```

#### Step 3: Update Raw File URLs

```typescript
// Adjust file paths to remove sub-path prefix
const adjustedPath =
  subPath && item.path.startsWith(subPath) ? item.path.substring(subPath.length + 1) : item.path;

const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
```

#### Step 4: Update URL Validation

Modify `validateUrl`:

```typescript
const validateUrl = (url: string): boolean => {
  // Support root, branch, and sub-path URLs
  const githubRegex =
    /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\/tree\/[\w.-]+(?:\/[\w./-]+)?)?$/;
  return githubRegex.test(url);
};
```

### Error Handling

Add specific error messages for:

- Invalid branch/commit: "Branch or commit not found"
- Invalid sub-path: "Path not found in repository"
- Empty results: "No files found at specified path"

## Testing Checklist

### File Tree Tests

- [ ] Exclude a file in tree → verify not in output
- [ ] Exclude a directory → verify all children excluded from output
- [ ] Include a previously excluded file → verify it appears in output
- [ ] Toggle file multiple times → verify final state is correct
- [ ] Use multi-file output → verify only included files in all parts

### GitHub URL Tests

- [ ] Root URL: `https://github.com/owner/repo`
- [ ] Branch URL: `https://github.com/owner/repo/tree/develop`
- [ ] Sub-path URL: `https://github.com/owner/repo/tree/main/src/components`
- [ ] Commit SHA URL: `https://github.com/owner/repo/tree/abc123/docs`
- [ ] Branch + deep path: `https://github.com/owner/repo/tree/feature/path/to/nested/folder`
- [ ] Invalid branch → proper error message
- [ ] Invalid path → proper error message

## Files to Modify

1. app.tsx
   - `generateOutput` function
   - `calculateChunks` function (ensure filtering)
   - Add validation function

2. utils.ts
   - `fetchGithubRepository` function
   - URL parsing regex
   - File filtering logic
   - Raw URL construction

3. repository-input.tsx
   - `validateUrl` function
   - Error message handling

4. types.ts
   - Make `FileStatus.index` required

## Implementation Order

1. **Phase 1: Fix File Tree Issues**
   - Update `FileStatus` type
   - Fix `generateOutput` filtering
   - Add sync validation
   - Test thoroughly

2. **Phase 2: Add GitHub URL Support**
   - Update URL regex
   - Modify repository fetching
   - Update validation
   - Add error handling
   - Test with various URL formats

## UI Improvements

### Repository Input Placeholder

Update placeholder text in `repository-input.tsx`:

```typescript
placeholder = "https://github.com/username/repository or branch/path URL";
```

### Error Messages

Add helpful error messages:

- "Branch 'develop' not found in repository"
- "Path 'src/components' not found in branch 'main'"
- "Successfully loaded 42 files from path 'docs/guides'"

## Documentation Updates

Update the following after implementation:

1. README.md - Add examples of branch/path URLs
2. comprehensive-guide.md - Add GitHub URL format section
3. about-section.tsx - Update features list

## Performance Considerations

- Branch/commit fetching adds one additional API call
- Sub-path filtering is done client-side after fetching full tree
- For large repositories with deep paths, consider implementing server-side filtering in future

## Security Considerations

- Validate all URL components to prevent injection
- Ensure branch/commit names are properly URL-encoded
- Handle private repositories gracefully (will fail with 404)
