---
name: release
description: Ship FileConcat from development to master. Cut the version and CHANGELOG on development, open the development-to-master PR, wait for the owner to merge it, then confirm the tag and GitHub Release. Use when the user runs /release or asks to release or ship to master.
disable-model-invocation: true
---

# Release

The order is fixed by `.github/workflows/release.yml`. The version must be cut on `development`
**before** the PR, because the bump commit has to reach `master` inside the merge. A cut after
the merge would leave `master` (and so the deployed site) on the old version, and the GitHub
Release would wait for the next merge.

```
cut on development -> PR development to master -> owner merges -> publish job writes the Release
```

The owner merges the PR. Never merge it yourself, never force-push, and never delete or move
a tag. A tag deletion is irreversible under this repo's rules.

## 1. Preflight

```bash
git fetch -q origin --tags
git log --oneline origin/master..origin/development    # empty: nothing to ship, stop
gh pr list --base master --head development --state open --json number,url   # reuse an open one
gh run list --workflow=ci.yml --branch development --limit 1 --json headSha,status,conclusion
```

- CI on the `origin/development` head must be `success`. If it is in progress, watch it
  (`gh run watch <id> --exit-status`). If it is red, stop and report. Do not ship a red head.
- Local uncommitted work is not shipped and does not block a release. Say so if there is any.
  Build side-effect files (`sitemap.xml`, `llms*.txt`, `models.json`) are never committed.

## 2. Cut the version on development

```bash
gh workflow run release.yml --ref development
# the run appears after a few seconds
gh run list --workflow=release.yml --event workflow_dispatch --limit 1 --json databaseId,createdAt
gh run watch <id> --exit-status
```

- **Success:** a `chore(release): X.Y.Z` commit and the `vX.Y.Z` tag are now on `development`.
  Read them back with `git fetch -q origin --tags && git describe --tags --abbrev=0 origin/development`
  and the section with `git show origin/development:CHANGELOG.md | head -30`. This commit was
  pushed by the workflow token, so CI does not run on it. It only changes the versions and
  CHANGELOG.md.
- **Failed with "nothing user-facing since the last release"** (check with
  `gh run view <id> --log-failed`): only docs/chore/ci/test/refactor commits since the last tag.
  No release this time. Continue to step 3, and the PR still ships the code.
- **Any other failure:** stop and report the failing step and its log lines. Do not re-run
  blindly. A half-done cut pushes nothing, because the push is atomic and comes last.

## 3. Open the PR

Title: `Release X.Y.Z` when a version was cut. Otherwise use a plain-words title for what
ships, in the style of earlier PRs (`gh pr list --base master --state merged --limit 5`).

Body: 2-4 plain-words bullets of what changes for a user, taken from the CHANGELOG section or,
with no release, from `git log origin/master..origin/development`. The repo is public. No session
links, no counter or analytics figures, nothing from `docs/` that is gitignored.

```bash
gh pr create --base master --head development --title "..." --body "..."
```

Give the owner the PR URL and say what merging it does (deploy, plus the Release when cut).

## 4. Wait for the merge, then confirm

Poll until the PR is merged or closed. Use a Monitor until-loop on
`gh pr view <n> --json state --jq .state` every 60 s, or wait for the owner to say it is merged.
If it was closed without a merge, stop and report.

After the merge:

```bash
gh run list --workflow=release.yml --branch master --limit 1 --json databaseId,status,conclusion
gh run watch <id> --exit-status
gh release view vX.Y.Z --json url,isImmutable,body
git pull -q --ff-only origin development
```

The publish job writes the Release for the newest `v*` tag on `master` that has none. When no
version was cut, it logs that the newest tag is already released, which is the expected
outcome.

## 5. Report

One short owner-brief: what shipped, the version (or "no release, only docs/chore/ci"), the
Release URL, and anything that did not go as described above.
