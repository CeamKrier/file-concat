import { describe, expect, it } from "vitest";
import { defaultSourceRegistry } from "../src/sources/default-registry";
import { githubAdapter } from "../src/sources/adapters/github";
import { urlAdapter } from "../src/sources/adapters/url";

describe("defaultSourceRegistry", () => {
  it("detects GitHub repositories", () => {
    const type = defaultSourceRegistry.detectType("https://github.com/owner/repo");

    expect(type).toBe("github");
  });

  it("detects gists separately from GitHub repos", () => {
    const type = defaultSourceRegistry.detectType("https://gist.github.com/user/123456");

    expect(type).toBe("gist");
  });

  it("falls back to URL adapter for generic URLs", () => {
    const type = defaultSourceRegistry.detectType("https://example.com/file.txt");

    expect(type).toBe("url");
  });
});

describe("githubAdapter", () => {
  it("flags raw URLs as invalid", () => {
    const parsed = githubAdapter.parseUrl(
      "https://raw.githubusercontent.com/owner/repo/main/README.md",
    );

    expect(parsed.isValid).toBe(false);
    expect(parsed.error).toContain("Raw GitHub URLs");
  });
});

describe("urlAdapter", () => {
  it("accepts http(s) URLs", () => {
    const parsed = urlAdapter.parseUrl("https://example.com/file.txt");

    expect(parsed.isValid).toBe(true);
  });

  it("rejects non-http URLs", () => {
    const parsed = urlAdapter.parseUrl("ftp://example.com/file.txt");

    expect(parsed.isValid).toBe(false);
  });
});
