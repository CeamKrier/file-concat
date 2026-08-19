// Runs on fileconcat.com and relays a batch from the panel into the page.
//
// `externally_connectable` would let the page talk to the extension directly,
// but it forces the extension id into shipped web code and pins that id with a
// manifest `key`. A content script plus `window.postMessage` costs the web app
// one listener and knows nothing about ids (ADR-0018).

import { browser, defineContentScript } from "#imports";
import { PUSH_CHANNEL, PUSH_VERSION, type PushRequest, type SiteResponse } from "../src/messages";
import type { Clipping } from "../src/markdown";

export default defineContentScript({
  matches: ["https://fileconcat.com/*", "http://localhost/*"],
  runAt: "document_idle",
  main() {
    let pending: Clipping[] | null = null;
    /** Set while a push is waiting on the page's verdict; holds its reply. */
    let waiting: ((answer: SiteResponse<number>) => void) | null = null;

    const post = (payload: Record<string, unknown>) =>
      window.postMessage({ channel: PUSH_CHANNEL, version: PUSH_VERSION, ...payload }, location.origin);

    /**
     * Ends the current wait, once, and drops `pending` whatever the outcome.
     *
     * Dropping it is the point. This script is injected into every
     * fileconcat.com tab, and /docs, /blog and /privacy never mount the page
     * listener, so a batch left held there used to wait for that tab to happen
     * to navigate onto a route that does mount — and then arrive, long after
     * the user had given up on it and re-sent.
     */
    const finish = (answer: SiteResponse<number>) => {
      const reply = waiting;
      pending = null;
      waiting = null;
      reply?.(answer);
    };

    // The worker can open a fresh tab and push before the page has mounted its
    // listener, so the batch is held until the page answers. A handshake rather
    // than an immediate post because the page announces `ready` on every mount,
    // and a batch must cross over exactly once.
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.channel !== PUSH_CHANNEL) return;
      if (event.data.type === "ready") {
        if (!pending) return;
        post({ type: "files", files: pending });
        pending = null;
        return;
      }
      // The page's verdict, which is the only thing that knows a batch actually
      // landed. `received` promises that it crossed and was accepted, not that
      // ingestion finished, so that is the most the worker may claim from it.
      if (event.data.type === "received") finish({ ok: true, value: Number(event.data.count) || 0 });
      if (event.data.type === "rejected")
        finish({ ok: false, error: String(event.data.reason ?? "The tab refused the batch.") });
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as PushRequest;
      if (request?.type !== "fc:push") return;

      // A push still waiting is answered rather than abandoned: its batch is
      // about to be overwritten below, and the worker would otherwise hear
      // nothing at all about the one it lost.
      finish({ ok: false, error: "A newer push replaced this one." });

      pending = request.files;
      const missed = "This tab never took the batch; it may be on a page that is not the tool.";
      const timer = setTimeout(() => finish({ ok: false, error: missed }), request.waitMs);
      waiting = (answer) => {
        clearTimeout(timer);
        sendResponse(answer);
      };
      post({ type: "ping" });
      return true;
    });
  },
});
