import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportPanel } from "~/components/app/import-panel";
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

describe("friendlyFetchError for GitHub's limits", () => {
  const repo = classifyUrl("https://github.com/owner/repo", "github");
  const archive = "https://github.com/owner/repo/archive/HEAD.zip";

  it.each([
    ["Failed to fetch", "network"],
    ["NetworkError when attempting to fetch resource.", "network"],
    ["Load failed", "network"],
    ["Repository 'owner/repo' is too large to list in the browser", "toolarge"],
  ])("%s -> %s", (message, reason) => {
    expect(friendlyFetchError(new Error(message), repo)?.reason).toBe(reason);
    expect(normalizeValue(`fetch/${reason}`)).toBe(`fetch/${reason}`);
  });

  // "Give it a minute" was wrong: the anonymous budget resets on the hour.
  it("names the reset time core read from GitHub and offers the ZIP", () => {
    const failure = friendlyFetchError(
      new Error("GitHub repo owner/repo: API rate limit reached (resets at 14:05, in 41m). Anonymous requests are limited to 60 per hour."),
      repo,
    );
    expect(failure?.message).toContain("14:05");
    expect(failure?.message).not.toMatch(/minute/);
    expect(failure?.archiveUrl).toBe(archive);
  });

  it("offers the ZIP of the branch the link names", () => {
    const branch = classifyUrl("https://github.com/owner/repo/tree/dev/src", "github");
    const failure = friendlyFetchError(new Error("Repository 'owner/repo' is too large to list in the browser"), branch);
    expect(failure?.archiveUrl).toBe("https://github.com/owner/repo/archive/dev.zip");
  });

  it("offers no ZIP where it would not help", () => {
    expect(friendlyFetchError(new Error("Repository 'owner/repo' not found"), repo)?.archiveUrl).toBeUndefined();
    const gitlab = classifyUrl("https://gitlab.com/owner/repo", "gitlab");
    expect(friendlyFetchError(new Error("HTTP 429 Too Many Requests"), gitlab)?.archiveUrl).toBeUndefined();
  });
});

// The link leaves the app in a new tab, so a half-built import is not lost.
it("the import panel shows the ZIP link in a new tab", () => {
  const archiveUrl = "https://github.com/owner/repo/archive/HEAD.zip";
  render(
    <ImportPanel
      tab="github"
      onTabChange={() => {}}
      url="https://github.com/owner/repo"
      onUrlChange={() => {}}
      error={{ message: "Limit used up.", archiveUrl }}
      onFetch={() => {}}
      isFetching={false}
    />,
  );
  const link = screen.getByRole("link", { name: "Download the ZIP from GitHub" });
  expect(link.getAttribute("href")).toBe(archiveUrl);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});
