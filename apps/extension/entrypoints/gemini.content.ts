// Gemini. One same-origin RPC, paged, holds the whole conversation, and the
// HTML apps it wrote come out as their own rows: the conversation is a set,
// like a playlist, and the worker opens it with `fc:expand` before clipping.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { conversationRef, createdFiles, fetchConversation, geminiUrl, readConversation, type Turn } from "../src/gemini";
import { clippingPath, renderChatClipping, sanitizeFilename, type Clipping } from "../src/markdown";
import type { PageItem, PageReport, SiteRequest, SiteResponse } from "../src/messages";

const OPTION = {
  label: "Include reasoning and tool activity",
  // Measured 2026-09-14 over 29 conversations: 1.0x to 2.05x each, 1.06x in
  // total. Gemini's JSON carries thinking and nothing else behind the opt-in.
  hint: "Thinking. Measured at 1 to 2.1 times the clipping's size across 29 conversations.",
};

const HEX16 = /^[0-9a-f]{16}$/;

/** `chat/<id>` is the transcript; `chat/<id>#<n>` the n-th created file. */
function parseId(id: string): { hex: string; file?: number } {
  const [base, index] = id.split("#");
  const hex = base.startsWith("chat/") ? base.slice(5) : "";
  if (!HEX16.test(hex)) throw new Error("This row is not a Gemini conversation. Clip it again from the page.");
  return index === undefined ? { hex } : { hex, file: Number(index) };
}

const title = () => document.title.replace(/ - Google Gemini$/, "").trim() || "Conversation";

// The conversation `fc:expand` fetched, so clipping each of the rows it opened
// is no request at all. Expanding always fetches, so a second clip of the same
// page after the conversation went on sees the new turns; a retry after a
// reload finds the cache empty and fetches again. The title travels with the
// turns: the RPC carries none, and the page may have moved on by the time a
// row is clipped.
let cached: { hex: string; turns: Turn[]; title: string } | undefined;

async function fetched(hex: string) {
  return { hex, turns: await fetchConversation(hex), title: title() };
}

async function conversation(hex: string) {
  if (cached?.hex !== hex) cached = await fetched(hex);
  return cached;
}

function report(): PageReport {
  const base = { site: "gemini", noun: "conversation" } as const;
  const hex = conversationRef(location.pathname);
  if (!hex) return { ...base, kind: "other", items: [] };
  return { ...base, kind: "single", items: [{ id: `chat/${hex}`, title: title(), expand: true }], option: OPTION };
}

async function expand(id: string): Promise<PageItem[]> {
  const { hex } = parseId(id);
  cached = await fetched(hex);
  return [{ id, title: cached.title }, ...createdFiles(cached.turns).map((file, index) => ({ id: `${id}#${index}`, title: file.path }))];
}

async function clip(id: string, grouped: boolean, activity: boolean, group?: string): Promise<Clipping> {
  const { hex, file } = parseId(id);
  // A transcript row only ever arrives with a `group` (the worker set it when
  // it opened the conversation out). Without one this is a retry of a row
  // whose expand failed, and a bare clip would drop the created files.
  if (file === undefined && group === undefined) throw new Error("Clip this conversation again from the page.");
  const { turns, title: name } = await conversation(hex);
  const folder = group ?? (grouped ? "gemini" : undefined);
  if (file !== undefined) {
    const created = createdFiles(turns)[file];
    if (!created) throw new Error("Gemini no longer lists this file in the conversation.");
    return {
      path: [folder, created.path].filter((part): part is string => !!part).map(sanitizeFilename).join("/"),
      markdown: created.text,
      source: geminiUrl(hex),
      clippedAt: Date.now(),
    };
  }
  const clipping = { ...readConversation(turns, hex, activity), title: name };
  return {
    path: clippingPath(clipping.title, folder),
    markdown: renderChatClipping(clipping),
    source: clipping.source,
    clippedAt: Date.now(),
  };
}

async function handle(request: SiteRequest): Promise<PageReport | Clipping | PageItem[]> {
  if (request.type === "fc:page") return report();
  if (request.type === "fc:expand") return expand(request.id);
  if (request.type === "fc:clip") return clip(request.id, request.grouped, request.option, request.group);
  throw new Error("Not something this page does.");
}

export default defineContentScript({
  matches: ["*://gemini.google.com/*"],
  runAt: "document_idle",
  main() {
    announceChanges(() => `${location.pathname}:${document.title}`);

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as SiteRequest;
      if (request?.type !== "fc:page" && request?.type !== "fc:clip" && request?.type !== "fc:expand") return;
      handle(request).then(
        (value) => sendResponse({ ok: true, value } satisfies SiteResponse<PageReport | Clipping | PageItem[]>),
        (error: unknown) =>
          sendResponse({ ok: false, error: String((error as Error)?.message ?? error) } satisfies SiteResponse<never>),
      );
      return true;
    });
  },
});
