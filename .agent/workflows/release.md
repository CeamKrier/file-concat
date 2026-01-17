---
description: Create a new release with version bump and changelog
---

# Release Workflow

This workflow guides the complete release process for FileConcat packages.

## Steps

### 1. Determine Release Scope

Ask the user:
- Which package(s) to release? (`@fileconcat/web`, `fileconcat` CLI, `@fileconcat/core`)
- Release type: `patch` (bug fix), `minor` (new feature), `major` (breaking change)?
- Any specific release notes to include?

### 2. Pre-Release Checks

1. Ensure working directory is clean: `git status`
2. Run full type check: `pnpm check`
3. Run linting: `pnpm lint`
4. Build all packages: `pnpm build:all`
5. Report any issues that need to be fixed before release

### 3. Update Package Versions

For each package being released:
1. Update `version` in `package.json`
2. Follow semver rules:
   - `patch`: 1.0.0 → 1.0.1 (bug fixes)
   - `minor`: 1.0.0 → 1.1.0 (new features)
   - `major`: 1.0.0 → 2.0.0 (breaking changes)
3. Update dependent packages if needed

### 4. Update Changelog

Create or update `CHANGELOG.md`:
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Changed behavior description

### Fixed
- Bug fix description
```

### 5. Create Git Tag

1. Stage version changes: `git add .`
2. Create commit: `git commit -m "chore: release vX.Y.Z"`
3. Create annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`

### 6. Publish (npm packages only)

For the `fileconcat` CLI package:
1. Navigate to package: `cd packages/cli`
2. Build: `pnpm build`
3. Publish: `npm publish`

### 7. Push to Remote

1. Push commits: `git push origin main`
2. Push tags: `git push origin --tags`

### 8. Post-Release

1. Summarize what was released
2. Provide links to published packages
3. Suggest announcing the release
