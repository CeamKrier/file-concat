// Shared HTTP error classification for remote source adapters. Callers
// handle 404 themselves (because "resource not found" wording is endpoint
// specific) and lean on this module for the auth, rate-limit, and server
// failure cases that look the same everywhere.

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export interface RateLimitInfo {
  retryAt?: Date;
  retryInSeconds?: number;
}

/**
 * Parse rate-limit hints from a Response. Supports the standard
 * `Retry-After` header (delta-seconds or HTTP-date) and GitHub's
 * `X-RateLimit-Reset` (Unix epoch seconds) which is what fires on 403s
 * caused by anonymous-quota exhaustion.
 */
export function readRateLimitInfo(response: Response): RateLimitInfo {
  const info: RateLimitInfo = {};

  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      info.retryInSeconds = Math.round(asNumber);
      info.retryAt = new Date(Date.now() + asNumber * 1000);
    } else {
      const asDate = Date.parse(retryAfter);
      if (Number.isFinite(asDate)) {
        info.retryAt = new Date(asDate);
        info.retryInSeconds = Math.max(0, Math.round((asDate - Date.now()) / 1000));
      }
    }
  }

  if (!info.retryAt) {
    const reset = response.headers.get("x-ratelimit-reset");
    const epoch = reset ? Number(reset) : NaN;
    if (Number.isFinite(epoch) && epoch > 0) {
      info.retryAt = new Date(epoch * 1000);
      info.retryInSeconds = Math.max(0, Math.round(epoch - Date.now() / 1000));
    }
  }

  return info;
}

function isGithubRateLimited(response: Response): boolean {
  const remaining = response.headers.get("x-ratelimit-remaining");
  return remaining === "0";
}

function formatRetryHint(info: RateLimitInfo): string {
  if (!info.retryAt && info.retryInSeconds === undefined) return "";
  const parts: string[] = [];
  if (info.retryAt) parts.push(`resets at ${TIME_FORMATTER.format(info.retryAt)}`);
  if (info.retryInSeconds !== undefined) {
    if (info.retryInSeconds < 60) parts.push(`in ${info.retryInSeconds}s`);
    else if (info.retryInSeconds < 3600) parts.push(`in ${Math.round(info.retryInSeconds / 60)}m`);
    else parts.push(`in ${Math.round(info.retryInSeconds / 3600)}h`);
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/**
 * Build a user-facing Error from a failed Response. Caller is expected to
 * have already short-circuited the 404 case with its own wording.
 */
export function classifyResponseError(response: Response, context: string): Error {
  const status = response.status;

  if (status === 401) {
    return new Error(
      `${context}: authentication required. Public access is needed for this resource right now.`,
    );
  }

  if (status === 403) {
    if (isGithubRateLimited(response)) {
      const hint = formatRetryHint(readRateLimitInfo(response));
      return new Error(
        `${context}: API rate limit reached${hint}. Anonymous requests are limited to 60 per hour.`,
      );
    }
    return new Error(`${context}: access forbidden. The resource may be private.`);
  }

  if (status === 429) {
    const hint = formatRetryHint(readRateLimitInfo(response));
    return new Error(`${context}: too many requests${hint}.`);
  }

  if (status >= 500 && status < 600) {
    return new Error(`${context}: upstream returned ${status}. Service may be degraded, retry shortly.`);
  }

  return new Error(`${context}: request failed (${status}).`);
}
