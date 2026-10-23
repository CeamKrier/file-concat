import { describe, expect, it } from "vitest";
import { classifyUrl } from "~/lib/classify-url";
import { friendlyFetchError } from "~/lib/fetch-error";
import { normalizeValue } from "~/lib/metrics";

// The reason is the `import_failed` value, so each branch must name itself and
// survive the counter's value normalizer unchanged.
describe("friendlyFetchError reason", () => {
  const repo = classifyUrl("https://github.com/owner/repo", "github");
  it.each([
    ["GitHub API 404: Not Found", "notfound"],
    ["API rate limit exceeded (403)", "ratelimit"],
    ["HTTP 429 Too Many Requests", "ratelimit"],
    ["Invalid repository URL", "badurl"],
    ["Repository is private", "private"],
    ["socket hang up", "other"],
  ])("%s -> %s", (message, reason) => {
    const failure = friendlyFetchError(new Error(message), repo);
    expect(failure?.reason).toBe(reason);
    expect(normalizeValue(`fetch/${reason}`)).toBe(`fetch/${reason}`);
  });

  it("is null for a deliberate cancel", () => {
    expect(friendlyFetchError(new Error("The operation was aborted"), repo)).toBeNull();
  });
});
