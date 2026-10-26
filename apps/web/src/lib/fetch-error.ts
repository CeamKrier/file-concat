import { githubAdapter } from "@fileconcat/core";
import type { Classification } from "~/lib/classify-url";

export type ImportError = {
  message: string;
  /** GitHub's own ZIP of the repo, for when the browser cannot list it. */
  archiveUrl?: string;
};

/** Built from the parsed parts only, never from the pasted text. */
function githubArchiveUrl(c: Classification): string | undefined {
  if (c.sourceType !== "github") return undefined;
  const parsed = githubAdapter.parseUrl(c.url);
  if (!parsed.isValid) return undefined;
  return `https://github.com/${parsed.owner}/${parsed.repo}/archive/${parsed.branch ?? "HEAD"}.zip`;
}

/**
 * Turn an engine fetch error into a friendly, info-toned line (never red), plus
 * the branch that produced it. The branch is the `import_failed` value
 * (`fetch/<reason>`), so the counter says why a fetch failed without the link.
 * The patterns match the wording of core's `classifyResponseError` and the
 * GitHub adapter, and the browsers' own words for a request that never landed.
 */
export function friendlyFetchError(
  error: unknown,
  c: Classification,
): (ImportError & { reason: string }) | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) return null;
  if (/too large/i.test(message))
    return {
      reason: "toolarge",
      message: "This repository is too big to list in the browser. Download it as a ZIP and drop it here.",
      archiveUrl: githubArchiveUrl(c),
    };
  if (/not found|404/i.test(message))
    return {
      reason: "notfound",
      message: `Couldn't find that one. Check the ${c.hostName} link is public and spelled right.`,
    };
  if (/rate limit|rate-limit|429|too many requests/i.test(message)) {
    const archiveUrl = githubArchiveUrl(c);
    if (!archiveUrl)
      return {
        reason: "ratelimit",
        message: `${c.hostName} is rate-limiting requests right now. Try again in a few minutes.`,
      };
    // Anonymous GitHub requests get 60 an hour per network, on GitHub's clock,
    // so the wait can be most of an hour.
    const resetAt = /resets at ([^,)]+)/.exec(message)?.[1];
    return {
      reason: "ratelimit",
      message: `GitHub's limit for requests without an account is used up on this network${
        resetAt ? ` until ${resetAt}` : " for up to an hour"
      }. Download the repository as a ZIP and drop it here, or try again then.`,
      archiveUrl,
    };
  }
  if (/invalid|format|expected/i.test(message))
    return {
      reason: "badurl",
      message: "Use a full repo URL, like github.com/owner/repo, rather than a profile or search page.",
    };
  if (/private|403|auth/i.test(message))
    return {
      reason: "private",
      message: "Only public links can be fetched. This one looks private or needs a login.",
    };
  // Chrome, Firefox and Safari wording for a request that got no response.
  if (/failed to fetch|networkerror|load failed/i.test(message))
    return {
      reason: "network",
      message: `Couldn't reach ${c.hostName}. Check your connection, or an extension that blocks requests, and try again.`,
    };
  return { reason: "other", message: "Couldn't fetch that link. Make sure it's public and try again." };
}
