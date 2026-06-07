import { describe, expect, it } from "vitest";
import {
  classifyResponseError,
  readRateLimitInfo,
} from "../src/sources/adapters/_errors";

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("classifyResponseError", () => {
  it("flags 401 as auth required", () => {
    const err = classifyResponseError(mockResponse(401), "GitHub repo octo/repo");
    expect(err.message).toMatch(/authentication required/i);
    expect(err.message).toContain("GitHub repo octo/repo");
  });

  it("distinguishes GitHub rate-limit 403 from a private-repo 403", () => {
    const rateLimited = mockResponse(403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600),
    });
    const forbidden = mockResponse(403);

    expect(classifyResponseError(rateLimited, "GitHub repo").message).toMatch(/rate limit/i);
    expect(classifyResponseError(forbidden, "GitHub repo").message).toMatch(/forbidden/i);
  });

  it("includes Retry-After hint on 429", () => {
    const err = classifyResponseError(mockResponse(429, { "retry-after": "30" }), "GitHub gist abc");
    expect(err.message).toMatch(/too many requests/i);
    expect(err.message).toMatch(/30s/);
  });

  it("reports degraded service for 5xx", () => {
    const err = classifyResponseError(mockResponse(503), "GitLab snippet 42");
    expect(err.message).toMatch(/503/);
    expect(err.message).toMatch(/degraded/i);
  });

  it("falls back to a generic message for unknown statuses", () => {
    const err = classifyResponseError(mockResponse(418), "GitHub repo");
    expect(err.message).toMatch(/418/);
  });
});

describe("readRateLimitInfo", () => {
  it("parses delta-seconds Retry-After", () => {
    const info = readRateLimitInfo(mockResponse(429, { "retry-after": "45" }));
    expect(info.retryInSeconds).toBe(45);
    expect(info.retryAt).toBeInstanceOf(Date);
  });

  it("falls back to X-RateLimit-Reset when Retry-After is absent", () => {
    const futureEpoch = Math.floor(Date.now() / 1000) + 120;
    const info = readRateLimitInfo(
      mockResponse(403, { "x-ratelimit-reset": String(futureEpoch) }),
    );
    expect(info.retryInSeconds).toBeGreaterThan(60);
    expect(info.retryAt?.getTime()).toBeCloseTo(futureEpoch * 1000, -3);
  });

  it("returns an empty info object when no hints are present", () => {
    const info = readRateLimitInfo(mockResponse(429));
    expect(info.retryInSeconds).toBeUndefined();
    expect(info.retryAt).toBeUndefined();
  });
});
