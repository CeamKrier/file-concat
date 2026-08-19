// Runs on fileconcat.com and relays a batch from the popup into the page.
//
// `externally_connectable` would let the page talk to the extension directly,
// but it forces the extension id into shipped web code and pins that id with a
// manifest `key`. A content script plus `window.postMessage` costs the web app
// one listener and knows nothing about ids (ADR-0018).

import { browser, defineContentScript } from "#imports";
import { PUSH_CHANNEL, PUSH_VERSION, type PushRequest } from "../src/messages";
import type { Clipping } from "../src/markdown";

export default defineContentScript({
  matches: ["https://fileconcat.com/*", "http://localhost/*"],
  runAt: "document_idle",
  main() {
    let pending: Clipping[] | null = null;

    const post = (payload: Record<string, unknown>) =>
      window.postMessage({ channel: PUSH_CHANNEL, version: PUSH_VERSION, ...payload }, location.origin);

    // The popup can open a fresh tab and push before the page has mounted its
    // listener, so the batch is held until the page answers. A handshake rather
    // than an immediate post because the page announces `ready` on every mount,
    // and a batch must cross over exactly once.
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.channel !== PUSH_CHANNEL || event.data?.type !== "ready") return;
      if (!pending) return;
      post({ type: "files", files: pending });
      pending = null;
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as PushRequest;
      if (request?.type !== "fc:push") return;
      pending = request.files;
      post({ type: "ping" });
      sendResponse({ ok: true });
    });
  },
});
