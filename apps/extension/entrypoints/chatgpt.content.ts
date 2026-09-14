// ChatGPT. One or two same-origin requests, and the whole conversation comes
// back as JSON; the page itself only ever holds a window of it.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { conversationRef, fetchConversation, parseRefId, readConversation, refId } from "../src/chatgpt";
import { clippingPath, renderChatClipping, type Clipping } from "../src/markdown";
import type { ItemRequest, PageReport, SiteRequest, SiteResponse } from "../src/messages";

const OPTION = {
  label: "Include reasoning and tool activity",
  // Measured 2026-09-14 on one 41-turn conversation: 2.9x on its share page,
  // 6.5x signed in, where MCP tool results are not redacted.
  hint: "Thought summaries, tool calls and their outputs. Measured at 3 to 6.5 times the clipping's size on a 41-turn conversation.",
};

function report(): PageReport {
  const base = { site: "chatgpt", noun: "conversation" } as const;
  const ref = conversationRef(location.pathname);
  if (!ref) return { ...base, kind: "other", items: [] };
  // The tab title is the conversation's name, on some builds behind a
  // `ChatGPT - ` prefix, and just "ChatGPT" before the conversation has one.
  const title = document.title.replace(/^ChatGPT - /, "").trim();
  return {
    ...base,
    kind: "single",
    items: [{ id: refId(ref), title: title && title !== "ChatGPT" ? title : "Conversation" }],
    option: OPTION,
  };
}

async function clip(id: string, grouped: boolean, activity: boolean): Promise<Clipping> {
  const ref = parseRefId(id);
  if (!ref) throw new Error("This row is not a ChatGPT conversation. Clip it again from the page.");
  const clipping = readConversation(await fetchConversation(ref), ref, activity);
  return {
    path: clippingPath(clipping.title, grouped ? "chatgpt" : undefined),
    markdown: renderChatClipping(clipping),
    source: clipping.source,
    clippedAt: Date.now(),
  };
}

async function handle(request: ItemRequest): Promise<PageReport | Clipping> {
  if (request.type === "fc:page") return report();
  return clip(request.id, request.grouped, request.option);
}

export default defineContentScript({
  // chat.openai.com redirects server-side before any content script runs.
  matches: ["*://chatgpt.com/*"],
  runAt: "document_idle",
  main() {
    announceChanges(() => `${location.pathname}:${document.title}`);

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:clip") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
