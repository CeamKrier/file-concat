import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { githubAdapter } from "../src/sources/adapters/github";
import { gitlabAdapter } from "../src/sources/adapters/gitlab";
import { bitbucketAdapter } from "../src/sources/adapters/bitbucket";

interface RespOpts {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  body?: unknown;
  url?: string;
  bytes?: Uint8Array;
}

const makeResponse = (o: RespOpts = {}) =>
  ({
    ok: o.ok ?? true,
    status: o.status ?? 200,
    statusText: undefined,
    headers: new Headers(o.headers),
    json: async () => o.json ?? {},
    text: async () => o.text ?? "",
    body: o.body,
    url: o.url ?? "",
    arrayBuffer: async () => (o.bytes ? o.bytes.buffer : new ArrayBuffer(0)),
  }) as unknown as Response;

const streamBody = (chunks: string[]) => {
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i >= chunks.length
          ? { done: true, value: undefined }
          : { done: false, value: new TextEncoder().encode(chunks[i++]) },
      cancel: () => undefined,
    }),
  };
};

describe("remote source completeness (ADR-0004) — failure surfacing", () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
    global.fetch = originalFetch;
  });

  it("github: surfaces a file that fails to download instead of dropping it silently", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u === "https://api.github.com/repos/owner/repo")
        return Promise.resolve(makeResponse({ json: { default_branch: "main" } }));
      if (u === "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1")
        return Promise.resolve(
          makeResponse({
            json: {
              tree: [
                { type: "blob", path: "a.ts", size: 3 },
                { type: "blob", path: "b.ts", size: 3 },
              ],
            },
          }),
        );
      if (u === "https://raw.githubusercontent.com/owner/repo/main/a.ts")
        return Promise.resolve(makeResponse({ body: streamBody(["ok"]) }));
      if (u === "https://raw.githubusercontent.com/owner/repo/main/b.ts")
        return Promise.resolve(makeResponse({ ok: false, status: 404 }));
      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");
    expect(result.error).toBeUndefined();
    expect(result.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(result.failures).toEqual([{ path: "b.ts", reason: expect.any(String) }]);
  });

  it("github: falls back to the full zipball when the git tree is truncated", async () => {
    const entries: Record<string, Uint8Array> = {
      "owner-repo-sha/a.ts": strToU8("aaa"),
      "owner-repo-sha/src/b.ts": strToU8("bbb"),
    };
    const zipBytes = zipSync(entries);

    mockFetch.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u === "https://api.github.com/repos/owner/repo")
        return Promise.resolve(makeResponse({ json: { default_branch: "main" } }));
      if (u === "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1")
        return Promise.resolve(
          // truncated: the listed tree is INCOMPLETE, so the adapter must not
          // trust it and instead pull the whole repo as a zipball.
          makeResponse({ json: { truncated: true, tree: [{ type: "blob", path: "a.ts", size: 3 }] } }),
        );
      if (u === "https://api.github.com/repos/owner/repo/zipball/main")
        return Promise.resolve(makeResponse({ bytes: zipBytes }));
      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await githubAdapter.fetchFiles("https://github.com/owner/repo");
    expect(result.error).toBeUndefined();
    expect(result.files.map((f) => f.path).sort()).toEqual(["a.ts", "src/b.ts"]);
  });

  it("gitlab: surfaces a file that fails to download", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u === "https://gitlab.com/api/v4/projects/owner%2Frepo")
        return Promise.resolve(makeResponse({ json: { default_branch: "main" } }));
      if (u.startsWith("https://gitlab.com/api/v4/projects/owner%2Frepo/repository/tree"))
        return Promise.resolve(
          makeResponse({
            json: [
              { path: "a.ts", type: "blob", name: "a.ts" },
              { path: "b.ts", type: "blob", name: "b.ts" },
            ],
            headers: { "x-total-pages": "1" },
          }),
        );
      if (u === "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/a.ts/raw?ref=main")
        return Promise.resolve(makeResponse({ text: "ok" }));
      if (u === "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/files/b.ts/raw?ref=main")
        return Promise.resolve(makeResponse({ ok: false, status: 404 }));
      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await gitlabAdapter.fetchFiles("https://gitlab.com/owner/repo");
    expect(result.error).toBeUndefined();
    expect(result.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(result.failures).toEqual([{ path: "b.ts", reason: expect.any(String) }]);
  });

  it("bitbucket: surfaces a file that fails to download", async () => {
    mockFetch.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u === "https://api.bitbucket.org/2.0/repositories/ws/repo/src")
        return Promise.resolve(
          makeResponse({ url: "https://api.bitbucket.org/2.0/repositories/ws/repo/src/abc1234/" }),
        );
      if (u === "https://api.bitbucket.org/2.0/repositories/ws/repo/src/abc1234/?pagelen=100")
        return Promise.resolve(
          makeResponse({
            json: {
              values: [
                { type: "commit_file", path: "a.ts", size: 3 },
                { type: "commit_file", path: "b.ts", size: 3 },
              ],
            },
          }),
        );
      if (u === "https://api.bitbucket.org/2.0/repositories/ws/repo/src/abc1234/a.ts")
        return Promise.resolve(makeResponse({ text: "ok" }));
      if (u === "https://api.bitbucket.org/2.0/repositories/ws/repo/src/abc1234/b.ts")
        return Promise.resolve(makeResponse({ ok: false, status: 404 }));
      return Promise.resolve(makeResponse({ ok: false, status: 404 }));
    });

    const result = await bitbucketAdapter.fetchFiles("https://bitbucket.org/ws/repo");
    expect(result.error).toBeUndefined();
    expect(result.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(result.failures).toEqual([{ path: "b.ts", reason: expect.any(String) }]);
  });
});
