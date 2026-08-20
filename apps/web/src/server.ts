import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

import { pruneCounters } from "~/lib/metrics-retention";

/**
 * Custom server entry.
 *
 * TanStack Start resolves `src/server` if it exists and falls back to its own
 * default entry otherwise (`resolveEntry({ defaultEntry: "server", required:
 * false })`). `wrangler.jsonc` still points `main` at the virtual
 * `@tanstack/react-start/server-entry` module and must keep doing so — the
 * Cloudflare plugin substitutes whichever entry was resolved into the generated
 * `dist/server/wrangler.json`.
 *
 * This file exists for one reason: the framework's default entry is built with
 * `createServerEntry`, which forwards **only** `fetch`. A Worker cron needs a
 * `scheduled` export on the same default object, so the entry has to be written
 * out here rather than wrapped. The `fetch` half is deliberately identical to
 * the default entry's.
 */

const startFetch = createStartHandler(defaultStreamHandler);

/**
 * A hashed asset the store no longer holds is not worker business.
 *
 * `wrangler.jsonc` runs the worker first only for the document routes, so a
 * request under `/assets/` reaches this handler for exactly one reason: the
 * file is gone, which after any deploy is every chunk the previous build
 * emitted. Left alone, the router renders its 404 page and the browser gets an
 * HTML body from a `.js` URL — a wasted SSR render answering a question about a
 * file with a page about the site. The import rejects either way; recovering
 * from that is TanStack Router's job and it already reloads once.
 */
const fetch: typeof startFetch = (request, ...rest) => {
  if (new URL(request.url).pathname.startsWith("/assets/")) {
    return new Response(null, { status: 404 });
  }
  return startFetch(request, ...rest);
};

export default {
  fetch,

  /**
   * Retention for the product counters (ADR-0014). The counters answer roadmap
   * questions on a quarterly cadence, so a row older than two quarters has never
   * changed a decision, and `/privacy` promises the same window from the same
   * constant.
   *
   * A failure here must not retry the whole schedule or surface anywhere: the
   * next run prunes the same rows plus a day's worth, so a missed night costs
   * nothing.
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pruneCounters(env.METRICS));
  },
};
