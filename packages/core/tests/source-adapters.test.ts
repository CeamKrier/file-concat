import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bitbucketAdapter, getBitbucketDisplayPath } from "../src/sources/adapters/bitbucket";
import { gistAdapter, parseGistUrl } from "../src/sources/adapters/gist";
import {
  getGitHubDisplayPath,
  githubAdapter,
  isGitHubTreeItemIncluded,
} from "../src/sources/adapters/github";
import {
  filterGitLabTreeItems,
  getGitLabDisplayPath,
  gitlabAdapter,
} from "../src/sources/adapters/gitlab";
import {
  getFilenameFromUrl,
  getLanguageFromFilename,
  parseUrlSource,
  urlAdapter,
} from "../src/sources/adapters/url";

type MockResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  body?: {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      cancel: () => void;
    };
  };
};

const makeResponse = (options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  body?: MockResponse["body"];
}): MockResponse => {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText,
    headers: new Headers(options.headers),
    json: async () => options.json ?? {},
    text: async () => options.text ?? "",
    body: options.body,
  };
};

const makeStreamBody = (chunks: string[]) => {
  let index = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (index >= chunks.length) {
          return { done: true, value: undefined };
        }
        const value = new TextEncoder().encode(chunks[index]);
        index += 1;
        return { done: false, value };
      },
      cancel: () => undefined,
    }),
  };
};

describe("githubAdapter helpers", () => {
  it("filters tree items", () => {
    expect(isGitHubTreeItemIncluded({ type: "tree", path: "src" }, "src")).toBe(false);
    expect(isGitHubTreeItemIncluded({ type: "blob", path: "src/index.ts" }, "src")).toBe(true);
    expect(isGitHubTreeItemIncluded({ type: "blob", path: "README.md" }, "src")).toBe(false);
  });

  it("normalizes display paths", () => {
    expect(getGitHubDisplayPath("src/index.ts", "src")).toBe("index.ts");
    expect(getGitHubDisplayPath("src", "src")).toBe("src");
    expect(getGitHubDisplayPath("README.md")).toBe("README.md");
  });
});

describe("gitlabAdapter helpers", () => {
  it("filters and normalizes tree items", () => {
    const files = filterGitLabTreeItems(
      [
        { path: "src/index.ts", type: "blob" },
        { path: "src", type: "tree" },
        { path: "README.md", type: "blob" },
      ],
      "src",
    );

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/index.ts");
    expect(getGitLabDisplayPath(files[0].path, "src")).toBe("index.ts");
  });
});

describe("bitbucketAdapter helpers", () => {
  it("normalizes display paths", () => {
    expect(getBitbucketDisplayPath("src/index.ts", "src")).toBe("index.ts");
    expect(getBitbucketDisplayPath("src", "src")).toBe("src");
  });
});

describe("parseUrl variants", () => {
  describe("github", () => {
    it("parses a bare repo URL with no branch or path", () => {
      const parsed = githubAdapter.parseUrl("https://github.com/owner/repo");

      expect(parsed.isValid).toBe(true);
      expect(parsed.owner).toBe("owner");
      expect(parsed.repo).toBe("repo");
      expect(parsed.branch).toBeUndefined();
      expect(parsed.path).toBeUndefined();
    });

    it("extracts the branch from /tree/<branch>", () => {
      const parsed = githubAdapter.parseUrl("https://github.com/owner/repo/tree/main");

      expect(parsed.isValid).toBe(true);
      expect(parsed.branch).toBe("main");
      expect(parsed.path).toBeUndefined();
    });

    it("extracts both branch and subpath from /tree/<branch>/<path>", () => {
      const parsed = githubAdapter.parseUrl(
        "https://github.com/owner/repo/tree/main/src/components",
      );

      expect(parsed.isValid).toBe(true);
      expect(parsed.branch).toBe("main");
      expect(parsed.path).toBe("src/components");
    });

    it("strips a trailing .git suffix from the repo name", () => {
      const parsed = githubAdapter.parseUrl("https://github.com/owner/repo.git");

      expect(parsed.isValid).toBe(true);
      expect(parsed.repo).toBe("repo");
    });

    it("rejects a URL missing the repo segment", () => {
      const parsed = githubAdapter.parseUrl("https://github.com/owner");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toMatch(/invalid github url/i);
    });
  });

  describe("gitlab", () => {
    it("parses a bare repo URL", () => {
      const parsed = gitlabAdapter.parseUrl("https://gitlab.com/owner/repo");

      expect(parsed.isValid).toBe(true);
      expect(parsed.owner).toBe("owner");
      expect(parsed.repo).toBe("repo");
    });

    it("handles nested groups (group/subgroup/project)", () => {
      const parsed = gitlabAdapter.parseUrl("https://gitlab.com/group/subgroup/repo");

      expect(parsed.isValid).toBe(true);
      expect(parsed.owner).toBe("group/subgroup");
      expect(parsed.repo).toBe("repo");
    });

    it("extracts branch and subpath through the /-/tree/ form", () => {
      const parsed = gitlabAdapter.parseUrl(
        "https://gitlab.com/owner/repo/-/tree/main/src/lib",
      );

      expect(parsed.isValid).toBe(true);
      expect(parsed.branch).toBe("main");
      expect(parsed.path).toBe("src/lib");
    });

    it("redirects snippet URLs to the gist adapter", () => {
      const parsed = gitlabAdapter.parseUrl("https://gitlab.com/snippets/12345");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toMatch(/gist adapter/i);
    });

    it("rejects a URL missing the project segment", () => {
      const parsed = gitlabAdapter.parseUrl("https://gitlab.com/owner");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toMatch(/project path|invalid gitlab/i);
    });
  });

  describe("bitbucket", () => {
    it("parses a bare workspace/repo URL", () => {
      const parsed = bitbucketAdapter.parseUrl("https://bitbucket.org/workspace/repo");

      expect(parsed.isValid).toBe(true);
      expect(parsed.owner).toBe("workspace");
      expect(parsed.repo).toBe("repo");
    });

    it("extracts branch and subpath from /src/<branch>/<path>", () => {
      const parsed = bitbucketAdapter.parseUrl(
        "https://bitbucket.org/workspace/repo/src/main/lib/index.ts",
      );

      expect(parsed.isValid).toBe(true);
      expect(parsed.branch).toBe("main");
      expect(parsed.path).toBe("lib/index.ts");
    });

    it("rejects a URL missing the repo segment", () => {
      const parsed = bitbucketAdapter.parseUrl("https://bitbucket.org/workspace");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toMatch(/invalid bitbucket/i);
    });
  });

  describe("gist", () => {
    it("rejects a URL that is neither a GitHub gist nor a GitLab snippet", () => {
      const parsed = gistAdapter.parseUrl("https://example.com/something");

      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toMatch(/invalid gist/i);
    });
  });
});

describe("gistAdapter parsing", () => {
  it("parses GitHub gist URLs", () => {
    const parsed = parseGistUrl("https://gist.github.com/octocat/abcdef123456");

    expect(parsed.isValid).toBe(true);
    expect(parsed.gistId).toBe("abcdef123456");
  });

  it("parses GitLab snippet URLs", () => {
    const parsed = parseGistUrl("https://gitlab.com/-/snippets/12345");

    expect(parsed.isValid).toBe(true);
    expect(parsed.gistId).toBe("gitlab:12345");
  });
});

describe("urlAdapter helpers", () => {
  it("extracts filenames and languages", () => {
    expect(getFilenameFromUrl("https://example.com/file.ts?x=1")).toBe("file.ts");
    expect(getLanguageFromFilename("file.ts")).toBe("typescript");
  });

  it("validates URL formats", () => {
    expect(parseUrlSource("ftp://example.com/file.txt").isValid).toBe(false);
    expect(parseUrlSource("https://example.com/file.txt").isValid).toBe(true);
  });
});

describe("adapter fetch flows", () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
    global.fetch = originalFetch;
  });

  it("fetches files from GitHub repositories", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      if (url === "https://api.github.com/repos/owner/repo") {
        return Promise.resolve(makeResponse({ json: { default_branch: "main" } }));
      }
      if (url === "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1") {
        return Promise.resolve(
          makeResponse({
            json: {
              tree: [
                { type: "blob", path: "src/index.ts", size: 3 },
                { type: "tree", path: "src" },
                { type: "blob", path: "README.md", size: 5 },
              ],
            },
          }),
        );
      }
      if (url === "https://raw.githubusercontent.com/owner/repo/main/src/index.ts") {
        return Promise.resolve(makeResponse({ body: makeStreamBody(["abc"]) }));
      }
      if (url === "https://raw.githubusercontent.com/owner/repo/main/README.md") {
        return Promise.resolve(makeResponse({ body: makeStreamBody(["hello"]) }));
      }

      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");

    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(2);
    expect(result.files[0].content).toBeDefined();
  });

  it("fetches files from GitLab repositories", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      if (url === "https://gitlab.com/api/v4/projects/owner%2Frepo") {
        return Promise.resolve(makeResponse({ json: { default_branch: "main" } }));
      }
      if (
        url ===
        "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/tree?ref=main&recursive=true&per_page=100&page=1"
      ) {
        return Promise.resolve(
          makeResponse({
            json: [
              { path: "src/index.ts", type: "blob", name: "index.ts" },
              { path: "src", type: "tree", name: "src" },
            ],
            headers: { "x-total-pages": "1" },
          }),
        );
      }
      if (
        url ===
        "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/src%2Findex.ts/raw?ref=main"
      ) {
        return Promise.resolve(makeResponse({ text: "console.log(1)" }));
      }

      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await gitlabAdapter.fetchFiles("https://gitlab.com/owner/repo");

    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/index.ts");
  });

  it("fetches files from Bitbucket repositories", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      if (url === "https://api.bitbucket.org/2.0/repositories/workspace/repo") {
        return Promise.resolve(makeResponse({ json: { mainbranch: { name: "main" } } }));
      }
      if (
        url === "https://api.bitbucket.org/2.0/repositories/workspace/repo/src/main/?pagelen=100"
      ) {
        return Promise.resolve(
          makeResponse({
            json: {
              values: [{ type: "commit_directory", path: "src" }],
            },
          }),
        );
      }
      if (
        url === "https://api.bitbucket.org/2.0/repositories/workspace/repo/src/main/src?pagelen=100"
      ) {
        return Promise.resolve(
          makeResponse({
            json: {
              values: [{ type: "commit_file", path: "src/index.ts", size: 10 }],
            },
          }),
        );
      }
      if (
        url === "https://api.bitbucket.org/2.0/repositories/workspace/repo/src/main/src/index.ts"
      ) {
        return Promise.resolve(makeResponse({ text: "let x = 1" }));
      }

      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await bitbucketAdapter.fetchFiles("https://bitbucket.org/workspace/repo");

    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/index.ts");
  });

  it("fetches files from gists", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      if (url === "https://api.github.com/gists/abcdef123456") {
        return Promise.resolve(
          makeResponse({
            json: {
              files: {
                "snippet.txt": {
                  filename: "snippet.txt",
                  content: "hello",
                  size: 5,
                  language: "Text",
                  raw_url: "https://gist.githubusercontent.com/raw/snippet.txt",
                },
              },
            },
          }),
        );
      }

      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await gistAdapter.fetchFiles("https://gist.github.com/user/abcdef123456");

    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("snippet.txt");
  });

  it("fetches raw URLs via url adapter", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        text: "console.log('ok')",
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const result = await urlAdapter.fetchFiles("https://example.com/file.ts");

    expect(result.error).toBeUndefined();
    expect(result.files[0].name).toBe("file.ts");
  });

  it("maps fetch errors for url adapter", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await urlAdapter.fetchFiles("https://example.com/file.ts");

    expect(result.files).toHaveLength(0);
    expect(result.error).toContain("CORS");
  });
});

describe("github error paths", () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
    global.fetch = originalFetch;
  });

  it("surfaces 401 as authentication required and names the repo", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 401 }));

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");

    expect(result.files).toHaveLength(0);
    expect(result.error).toMatch(/authentication required/i);
    expect(result.error).toContain("owner/repo");
  });

  it("distinguishes a rate-limited 403 from a forbidden 403", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 600;
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetAt),
        },
      }),
    );

    const rateLimited = await githubAdapter.fetchFiles("https://github.com/owner/repo");
    expect(rateLimited.error).toMatch(/rate limit/i);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 403 }));

    const forbidden = await githubAdapter.fetchFiles("https://github.com/owner/repo");
    expect(forbidden.error).toMatch(/forbidden/i);
    expect(forbidden.error).not.toMatch(/rate limit/i);
  });

  it("includes a Retry-After hint on 429", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 429, headers: { "retry-after": "45" } }),
    );

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");

    expect(result.error).toMatch(/too many requests/i);
    expect(result.error).toMatch(/45s/);
  });

  it("reports degraded service for 5xx", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 503 }));

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");

    expect(result.error).toMatch(/503/);
    expect(result.error).toMatch(/degraded/i);
  });

  it("preserves the endpoint-specific 404 wording", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 404 }));

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");

    expect(result.error).toBe("Repository 'owner/repo' not found");
  });
});

describe("gist error paths", () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
    global.fetch = originalFetch;
  });

  it("surfaces 401 on the GitHub gist endpoint", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 401 }));

    const result = await gistAdapter.fetchFiles("https://gist.github.com/octocat/abcdef123456");

    expect(result.error).toMatch(/authentication required/i);
    expect(result.error).toContain("abcdef123456");
  });

  it("flags 429 rate limit with a duration hint", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 429, headers: { "retry-after": "120" } }),
    );

    const result = await gistAdapter.fetchFiles("https://gist.github.com/octocat/abcdef123456");

    expect(result.error).toMatch(/too many requests/i);
    expect(result.error).toMatch(/2m/);
  });

  it("preserves 'Gist not found' wording on 404", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 404 }));

    const result = await gistAdapter.fetchFiles("https://gist.github.com/octocat/abcdef123456");

    expect(result.error).toBe("Gist not found");
  });

  it("forwards GitLab snippet 5xx as a degraded-service message", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 503 }));

    const result = await gistAdapter.fetchFiles("https://gitlab.com/-/snippets/12345");

    expect(result.error).toMatch(/503/);
    expect(result.error).toMatch(/degraded/i);
  });
});
