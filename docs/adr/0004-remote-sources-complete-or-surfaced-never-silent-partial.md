# Remote imports: a complete bundle, or a surfaced gap — never a silent partial

FileConcat imports whole repositories from GitHub, GitLab, and Bitbucket. ADR-0002
established that local exclusion is never a silent "guilty until proven innocent"
filter — whatever is skipped is named and restorable. This ADR extends that same
honesty requirement to **remote sources**: an imported bundle is either complete,
or its incompleteness is reported to the user — it is **never silently partial**.

Two distinct silent-incompleteness paths existed, both violating that principle:

1. **GitHub — incomplete listing.** The adapter reads the git-trees API with
   `?recursive=1` in a single call and ignores GitHub's `truncated: true` flag,
   which fires above ~100k tree entries or a 7 MB response. Past that ceiling the
   repo is silently cut off; both the file count and the download operate on the
   truncated set and present it as the whole repo. GitLab (cursor pagination) and
   Bitbucket (paginated `/src` + recursive walk) do not have this listing cap.

2. **All three — incomplete download.** Files are fetched one request each with
   **unbounded concurrency** (`files.map` + `Promise.all`). Under rate limiting
   that fan-out drops files; on Bitbucket the per-file fetch was a bare `fetch()`
   with no retry, so throttled files fell to `null` and vanished from the bundle
   with only a `console.warn`.

## Decision

- **GitHub large-repo path:** when the tree comes back `truncated`, fall back to
  downloading the repository **tarball** (`/repos/{o}/{r}/tarball/{ref}`) in a
  single request and expanding it client-side through the archive extraction the
  web already ships. One request bypasses both the tree cap **and** the per-file
  rate-limit fan-out. Non-truncated repos keep the current selective per-file
  path (fast, and it downloads only the files that survive filtering).

- **Every source's download path:** a single **bounded-concurrency** helper, all
  per-file requests routed through the rate-limit-retry path, and any file that
  still fails **surfaced in the result summary** ("N files couldn't be fetched")
  rather than dropped to `null`. This is ADR-0002's skipped-file transparency,
  applied to fetch failures.

- **Bitbucket / GitLab very-large repos** may adopt the same archive-download
  escape hatch (Bitbucket `get/{ref}.tar.gz`) to kill both the serial-DFS listing
  cost and the fan-out — optional, same shape as the GitHub fallback.

## Deliberately rejected

- **Always download the tarball for every repo.** Rejected: for normal repos the
  selective per-file path only pulls the files that pass ignore/size/noise
  filtering, whereas a tarball drags down noise and binaries too. Tarball is a
  **fallback for large repos**, not the default.
- **Keep silent best-effort.** Rejected outright — it is the exact silent-filter
  behavior ADR-0002 forbids, just relocated from local exclusion to remote fetch.

## Consequences

- On the tarball path, ignore/size/noise filtering runs **after** extraction
  rather than gating the download — acceptable because it only triggers on repos
  whose tree already truncated, where selective download was impossible anyway.
- **Authentication (PAT) to raise rate limits remains a separate, open lever.**
  Unauthenticated GitHub is 60 req/hr; even bounded + retried, a large per-file
  download can exhaust it. A token option is deliberately out of scope here and
  recorded as unresolved.
- Bounded concurrency marginally slows the common small-repo case, in exchange
  for removing the silent-drop failure mode entirely.
