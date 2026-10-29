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

## 1b. Clipper canary, weekly

The extension reads ChatGPT, Claude, Gemini, YouTube, Reddit, HN and articles through each
site's own internal shapes, which change without notice. A local canary clips one fixed page per
site in the owner's debug Chrome and compares counts with a recorded baseline. It lives in
gitignored `docs/clipper-chat-probes/canary/`, so on any other machine this step does nothing.

```bash
C=docs/clipper-chat-probes/canary
if [ -f $C/canary.sh ]; then
  node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").pop();const d=(Date.now()-Date.parse(JSON.parse(l).at))/864e5;console.log(d.toFixed(1)+" days since the last canary run");process.exit(d>=7?1:0)' $C/canary.log \
    || bash $C/canary.sh
fi
```

- It runs only when the last run is 7 or more days old, and takes about 2 minutes. When the
  debug Chrome is not running it starts it, and closes it again afterwards.
- `DRIFT` or `BROKEN` means a reader broke. Report it as a finding with the site name. It does
  not block the web release: the fix ships as a clipper release.
- `SIGNED-OUT` means the debug profile lost that site's session. Ask the owner to sign in there,
  then rerun `bash $C/canary.sh`.
- After an intended change to a reader's output, rebaseline with `bash $C/canary.sh --record`.

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

## 2b. Rerun the benchmarks at the new version

Only when step 2 cut a version. The scripts label their rows from `apps/web/package.json`,
which now holds the new version, and the code they measure is the code the cut just tagged.

```bash
git pull -q --ff-only origin development
bash packages/cli/scripts/bench/rerun-documents.sh          # every release, about 3 min
TAG=$(git describe --tags --abbrev=0 HEAD^)                 # the previous release
git diff --quiet "$TAG" HEAD -- packages/core/src/file-processing apps/web/src/lib vendor \
  ':!apps/web/src/lib/benchmarks.ts' \
  || bash packages/cli/scripts/bench/rerun-browser.sh       # PDF, web pages, archives: about an hour
git diff --quiet "$TAG" HEAD -- packages/core/src packages/cli/src \
  || bash packages/cli/scripts/bench/rerun-repos.sh --clones ~/.cache/fileconcat-bench-repos   # 60 clones, 5-25 min
node packages/cli/scripts/bench/add-rows.mjs docs/measurements/bench-*-X.Y.json
```

- `apps/web/tests/benchmarks.test.ts` fails until the document charts carry the new version,
  so a skipped rerun turns the next CI run red.
- A chart that was not rerun keeps its older row and moves to "Not rerun at X.Y" on
  `/benchmarks` by itself. Name those charts in the report.
- A number that dropped is a finding: report it with its cause. Never adjust a script or a
  corpus to restore it.
- Commit only `apps/web/src/data/benchmarks.json` (`chore(web): benchmarks rerun at X.Y`). The
  owner pushes it to `development` before the PR opens, so the data reaches `master` with the
  release.
  The `docs/measurements/` outputs are gitignored.

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
