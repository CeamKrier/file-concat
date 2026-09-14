// Claude. One same-origin request holds the whole conversation, and the files
// it wrote come out as their own rows: the conversation is a set, like a
// playlist, and the worker opens it with `fc:expand` before clipping.

import { browser, defineContentScript } from "#imports";
import { announceChanges } from "../src/announce";
import { type ClaudeConversation, claudeUrl, conversationRef, createdFiles, fetchConversation, readConversation } from "../src/claude";
import { clippingPath, renderChatClipping, sanitizeFilename, type Clipping } from "../src/markdown";
import type { PageItem, PageReport, SiteRequest, SiteResponse } from "../src/messages";

const OPTION = {
  label: "Include reasoning and tool activity",
  // Measured 2026-09-14 over nine conversations: 1.0x to 3.65x each, 1.74x
  // in total, counting thinking, tool inputs and outputs and attached text.
  hint: "Thinking, tool calls and their outputs, attached file contents. Measured at 1 to 3.7 times the clipping's size across nine conversations.",
};

const UUID = /^[0-9a-f-]{36}$/;

/** `chat/<uuid>` is the transcript; `chat/<uuid>#<n>` the n-th created file. */
function parseId(id: string): { uuid: string; file?: number } {
  const [base, index] = id.split("#");
  const uuid = base.startsWith("chat/") ? base.slice(5) : "";
  if (!UUID.test(uuid)) throw new Error("This row is not a Claude conversation. Clip it again from the page.");
  return index === undefined ? { uuid } : { uuid, file: Number(index) };
}

// The conversation `fc:expand` fetched, so clipping each of the rows it opened
// is no request at all. Expanding always fetches, so a second clip of the same
// page after the conversation went on sees the new messages; a retry after a
// reload finds the cache empty and fetches again.
let cached: { uuid: string; json: ClaudeConversation } | undefined;

async function conversation(uuid: string): Promise<ClaudeConversation> {
  if (cached?.uuid !== uuid) cached = { uuid, json: await fetchConversation(uuid) };
  return cached.json;
}

function report(): PageReport {
  const base = { site: "claude", noun: "conversation" } as const;
  const uuid = conversationRef(location.pathname);
  if (!uuid) return { ...base, kind: "other", items: [] };
  const title = document.title.replace(/ - Claude$/, "").trim() || "Conversation";
  return { ...base, kind: "single", items: [{ id: `chat/${uuid}`, title, expand: true }], option: OPTION };
}

async function expand(id: string): Promise<PageItem[]> {
  const { uuid } = parseId(id);
  cached = { uuid, json: await fetchConversation(uuid) };
  const json = cached.json;
  const title = json.name?.trim() || "Conversation";
  return [
    { id, title },
    ...createdFiles(json).map((file, index) => ({ id: `${id}#${index}`, title: file.path.split("/").pop() || file.path })),
  ];
}

async function clip(id: string, grouped: boolean, activity: boolean, group?: string): Promise<Clipping> {
  const { uuid, file } = parseId(id);
  const json = await conversation(uuid);
  // `group` is the folder the worker chose: the conversation's own name.
  const folder = group ?? (grouped ? "claude" : undefined);
  if (file !== undefined) {
    const created = createdFiles(json)[file];
    if (!created) throw new Error("Claude no longer lists this file in the conversation.");
    const name = created.path.split("/").pop() || "file";
    return {
      path: [folder, name].filter((part): part is string => !!part).map(sanitizeFilename).join("/"),
      markdown: created.text,
      source: claudeUrl(uuid),
      clippedAt: Date.now(),
    };
  }
  const clipping = readConversation(json, uuid, activity);
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
  matches: ["*://claude.ai/*"],
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
