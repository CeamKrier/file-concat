import { describe, expect, it } from "vitest";
import { SHAPE_CHANGED as CHATGPT } from "../src/chatgpt";
import { SHAPE_CHANGED as CLAUDE } from "../src/claude";
import { SHAPE_CHANGED as GEMINI } from "../src/gemini";
import { reportUrl } from "../src/messages";

describe("reportUrl", () => {
  it("keeps the three readers' sentences as they were", () => {
    expect(CLAUDE).toBe(
      "Claude changed the shape of this conversation. Reload the extension, and if this persists, report it.",
    );
    expect([CHATGPT, GEMINI].map((s) => s.split(" ")[0])).toEqual(["ChatGPT", "Gemini"]);
  });

  it("files a shape change with the brand and version, and nothing from the page", () => {
    const url = new URL(reportUrl(GEMINI, "0.3.4")!);
    expect(url.origin + url.pathname).toBe("https://github.com/CeamKrier/file-concat/issues/new");
    expect(url.searchParams.get("title")).toBe("Clipper 0.3.4: the Gemini reader stopped working");
    expect(url.searchParams.get("body")).toContain(GEMINI);
    expect([...url.searchParams.keys()]).toEqual(["title", "body"]);
  });

  it("offers nothing for any other error", () => {
    expect(reportUrl("Sign in to Claude to clip this conversation.", "0.3.4")).toBeUndefined();
    expect(reportUrl(`${CLAUDE} https://claude.ai/chat/x`, "0.3.4")).toBeUndefined();
    expect(reportUrl(undefined, "0.3.4")).toBeUndefined();
  });
});
