import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { METRIC_EVENTS, type MetricEvent } from "~/lib/metric-events";

/**
 * Product counter sink (ADR-0013, revised by ADR-0014).
 *
 * Writes anonymous, unlinked event rows. It deliberately stores nothing about
 * the requester: no IP, no user agent, no country, no cookie. The only
 * identifier written is the client's page-lifetime id, plus a run counter that
 * restarts at 1 with it — enough to read one visit as a sequence, never enough
 * to link two.
 *
 * The connecting IP is read for exactly one purpose — as the rate limiter's
 * key — and never reaches the database or a log. Cloudflare's edge already
 * terminates the connection, so this adds no exposure that the request itself
 * did not; what would break the promise is persisting it, which nothing here
 * does.
 *
 * The event-name allowlist is imported from the client module rather than
 * duplicated, so a counter cannot be recorded on one side and silently dropped
 * on the other.
 */

/** Mirrors the client's cap. A larger batch is rejected, not truncated. */
const MAX_EVENTS = 50;
/** Comfortably above a full 50-event batch; anything larger is not ours. */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_VALUE_LENGTH = 32;
const MAX_PAGE_ID_LENGTH = 64;
/**
 * Quantities are attacker-controlled on an unauthenticated endpoint, so they get
 * their own bound the way `value` has a pattern. ~1 TB of bytes, or 31 years in
 * milliseconds: past that it is not a measurement of anything we do.
 */
const MAX_AMOUNT = 1e12;
/** A page doing more than this many drops is not a reading we want to store. */
const MAX_RUN = 1000;

const ALLOWED: ReadonlySet<string> = new Set(METRIC_EVENTS);

/**
 * Local `wrangler dev` sends no `CF-Connecting-IP`, so everything there shares
 * one bucket. That is what makes the limiter testable without spoofing headers,
 * and in production the header is always present.
 */
const UNKNOWN_CLIENT = "no-connecting-ip";

/** Same shape the client normalizes to. Rejected rather than sanitized here. */
const VALUE_PATTERN = /^[a-z0-9._/+-]{1,32}$/;
const PAGE_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

/** Wire shape: `n` name, `v` value, `q` quantity, `b` bytes, `r` run. */
type IncomingEvent = { n: string; v?: unknown; q?: unknown; b?: unknown; r?: unknown };
type IncomingBody = { s?: unknown; e?: unknown };

type ValidEvent = {
  name: MetricEvent;
  value: string | null;
  run: number | null;
  /** The client's `q`, bound to the `n` column. */
  count: number | null;
  bytes: number | null;
};

/** Whole, non-negative, in range. Anything else becomes null rather than rejecting the event. */
function validAmount(raw: unknown, max: number): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw > max) return null;
  return raw;
}

function validValue(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.length > MAX_VALUE_LENGTH) return undefined;
  if (!VALUE_PATTERN.test(raw)) return undefined;
  return raw;
}

function validEvents(raw: unknown): ValidEvent[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) return [];

  const out: ValidEvent[] = [];
  for (const item of raw as IncomingEvent[]) {
    if (!item || typeof item !== "object" || typeof item.n !== "string") continue;
    if (!ALLOWED.has(item.n)) continue;

    // A malformed value drops the whole event: a counter with a mangled label is
    // worse than a missing one, because it silently joins the wrong bucket.
    const value = validValue(item.v);
    if (value === undefined) continue;

    const run = validAmount(item.r, MAX_RUN);
    const count = validAmount(item.q, MAX_AMOUNT);
    const bytes = validAmount(item.b, MAX_AMOUNT);

    // Nothing to record: no label and no quantity says less than the name alone.
    if (value === null && count === null && bytes === null) continue;

    out.push({ name: item.n as MetricEvent, value, run, count, bytes });
  }
  return out;
}

export const Route = createFileRoute("/api/e")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Counters are best-effort and the client never reads the body, so every
        // failure path answers 204. A visible error here would be a bug report
        // about a feature the user did not ask for.
        const noContent = new Response(null, { status: 204 });

        try {
          // Before reading the body: an unauthenticated public write whose
          // shape is documented in a public repo is worth bounding, and the
          // scarce resource is D1 writes, not CPU. 30 requests per 10s is
          // roughly ten times the busiest real client — it debounces 1.5s and
          // batches up to 50 events, so even a huge drop sends a handful of
          // requests. Answers 204 like every other rejection: the client never
          // reads the body, and a 429 would only tell an abuser what to evade.
          //
          // This raises the cost of abuse rather than capping the daily total —
          // the limiter is per-IP and per-colo. The backstop for the rest is
          // that exceeding D1's quota throws into the catch below, so counters
          // stop recording while the tool itself keeps working.
          const clientKey = request.headers.get("CF-Connecting-IP") ?? UNKNOWN_CLIENT;
          const { success } = await env.METRICS_LIMITER.limit({ key: clientKey });
          if (!success) return noContent;

          const raw = await request.text();
          if (raw.length === 0 || raw.length > MAX_BODY_BYTES) return noContent;

          const body = JSON.parse(raw) as IncomingBody;
          const page = body.s;
          if (typeof page !== "string" || page.length > MAX_PAGE_ID_LENGTH) return noContent;
          if (!PAGE_ID_PATTERN.test(page)) return noContent;

          const events = validEvents(body.e);
          if (events.length === 0) return noContent;

          const ts = Math.floor(Date.now() / 1000);
          const insert = env.METRICS.prepare(
            "INSERT INTO events (ts, page, name, value, run, n, b) VALUES (?, ?, ?, ?, ?, ?, ?)",
          );
          await env.METRICS.batch(
            events.map((e) => insert.bind(ts, page, e.name, e.value, e.run, e.count, e.bytes)),
          );
        } catch (error) {
          // Never surfaced to the client — a counter must not turn into a bug
          // report about a feature nobody asked for. Logged, though: a silently
          // swallowed insert failure makes a broken counter undiagnosable, and
          // an empty table looks identical to no traffic.
          console.error("Failed to record counters:", error);
        }

        return noContent;
      },
    },
  },
});
