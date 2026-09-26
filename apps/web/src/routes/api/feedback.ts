import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { validFeedback } from "~/lib/feedback";

/**
 * Feedback sink. Unlike the counter sink next door, somebody typed this and is
 * watching for the result, so it answers honestly: 204 stored, 400 not a note,
 * 429 limited, 500 not stored. The panel keeps the draft on anything but 204.
 *
 * Stores the note with the page id and Run the counters already carry, plus an
 * email only if the person typed one to get a reply. Nothing else about the
 * requester: the IP is read only as the limiter key, the same way `/api/e`
 * reads it.
 */

/** 2,000 characters at four UTF-8 bytes each, plus the envelope. */
const MAX_BODY_BYTES = 10 * 1024;

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shares the counters' limiter: a real visit sends one note, so a key
        // that exhausts 30 requests in 10 seconds is not a person writing.
        const clientKey = request.headers.get("CF-Connecting-IP") ?? "no-connecting-ip";
        const { success } = await env.METRICS_LIMITER.limit({ key: clientKey });
        if (!success) return new Response(null, { status: 429 });

        const raw = await request.text();
        if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
          return new Response(null, { status: 400 });
        }

        let note;
        try {
          note = validFeedback(JSON.parse(raw));
        } catch {
          note = null;
        }
        if (!note) return new Response(null, { status: 400 });

        try {
          await env.METRICS.prepare(
            "INSERT INTO feedback (ts, page, run, origin, message, email) VALUES (?, ?, ?, ?, ?, ?)",
          )
            .bind(
              Math.floor(Date.now() / 1000),
              note.page,
              note.run,
              note.origin,
              note.message,
              note.email,
            )
            .run();
        } catch (error) {
          console.error("Failed to store feedback:", error);
          return new Response(null, { status: 500 });
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
