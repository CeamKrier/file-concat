import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { METRIC_EVENTS, type MetricEvent } from "~/lib/metric-events";

/**
 * Product counter sink (ADR-0013).
 *
 * Writes anonymous, unlinked event rows. It deliberately records nothing about
 * the requester: no IP, no user agent, no country, no cookie. The only
 * identifier is the client's page-lifetime id, which the browser generates per
 * page load and never reuses.
 *
 * The event-name allowlist is imported from the client module rather than
 * duplicated, so a counter cannot be recorded on one side and silently dropped
 * on the other.
 */

/** Mirrors the client's cap. A larger batch is rejected, not truncated. */
const MAX_EVENTS = 50;
/** Comfortably above a full 50-event batch; anything larger is not ours. */
const MAX_BODY_BYTES = 8 * 1024;
const MAX_VALUE_LENGTH = 32;
const MAX_PAGE_ID_LENGTH = 64;

const ALLOWED: ReadonlySet<string> = new Set(METRIC_EVENTS);

/** Same shape the client normalizes to. Rejected rather than sanitized here. */
const VALUE_PATTERN = /^[a-z0-9._/+-]{1,32}$/;
const PAGE_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

type IncomingEvent = { n: string; v?: unknown };
type IncomingBody = { s?: unknown; e?: unknown };

type ValidEvent = { name: MetricEvent; value: string | null };

function validEvents(raw: unknown): ValidEvent[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) return [];

  const out: ValidEvent[] = [];
  for (const item of raw as IncomingEvent[]) {
    if (!item || typeof item !== "object" || typeof item.n !== "string") continue;
    if (!ALLOWED.has(item.n)) continue;

    if (item.v === undefined || item.v === null) {
      out.push({ name: item.n as MetricEvent, value: null });
      continue;
    }
    if (typeof item.v !== "string" || item.v.length > MAX_VALUE_LENGTH) continue;
    if (!VALUE_PATTERN.test(item.v)) continue;
    out.push({ name: item.n as MetricEvent, value: item.v });
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
            "INSERT INTO events (ts, page, name, value) VALUES (?, ?, ?, ?)",
          );
          await env.METRICS.batch(events.map((e) => insert.bind(ts, page, e.name, e.value)));
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
