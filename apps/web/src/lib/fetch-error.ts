import type { Classification } from "~/lib/classify-url";

/**
 * Turn an engine fetch error into a friendly, info-toned line (never red), plus
 * the branch that produced it. The branch is the `import_failed` value
 * (`fetch/<reason>`), so the counter says why a fetch failed without the link.
 * The patterns match the wording of core's `classifyResponseError`.
 */
export function friendlyFetchError(
  error: unknown,
  c: Classification,
): { reason: string; message: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) return null;
  if (/not found|404/i.test(message))
    return {
      reason: "notfound",
      message: `Couldn't find that one. Check the ${c.hostName} link is public and spelled right.`,
    };
  if (/rate limit|rate-limit|429|too many requests/i.test(message))
    return {
      reason: "ratelimit",
      message: `${c.hostName} is rate-limiting requests right now. Give it a minute and try again.`,
    };
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
  return { reason: "other", message: "Couldn't fetch that link. Make sure it's public and try again." };
}
