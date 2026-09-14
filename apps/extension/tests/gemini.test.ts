import { describe, expect, it } from "vitest";
import { conversationRef, geminiUrl, parseBatch, readToken, SHAPE_CHANGED } from "../src/gemini";

// A made-up id: a real conversation id has no place in a public repo.
const ID = "0123456789abcdef";

describe("conversationRef", () => {
  it("reads /app/<16 hex> and nothing else", () => {
    expect(conversationRef(`/app/${ID}`)).toBe(ID);
    for (const path of ["/", "/app", "/app/", "/app/nope", `/app/${ID}/x`, `/gem/abc/${ID}`, `/share/${ID}`, "/app/0123456789ABCDEF"]) {
      expect(conversationRef(path)).toBeNull();
    }
  });

  it("names the page", () => {
    expect(geminiUrl(ID)).toBe(`https://gemini.google.com/app/${ID}`);
  });
});

describe("parseBatch", () => {
  // The envelope: a magic prefix, a blank line, then <length>\n<json> chunks.
  // The length is not a JS string index, so the parser goes by lines.
  const body = (payload: unknown, extra = "") =>
    `)]}'\n\n123\n${JSON.stringify([["wrb.fr", "hNvQHb", JSON.stringify(payload), null, null, null, "generic"]])}\n${extra}45\n[["di",947],["af.httprm",947,"-1234",5]]\n12\n[["e",4,null,null,999]]\n`;

  it("returns the hNvQHb payload", () => {
    const payload = [[["t"]], "cursor", null, [[[]]]];
    expect(parseBatch(body(payload))).toEqual(payload);
  });

  it("returns null when the entry's payload is null (no such conversation)", () => {
    const text = `)]}'\n\n90\n${JSON.stringify([["wrb.fr", "hNvQHb", null, null, null, [5, null, [["type.googleapis.com/x", [11]]]], "generic"]])}\n`;
    expect(parseBatch(text)).toBeNull();
  });

  it("throws the shape error when no wrb.fr entry is found or the payload is not turns", () => {
    expect(() => parseBatch(`)]}'\n\n40\n[["er",null,null,null,null,[400]]]\n`)).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch("<html>bot check</html>")).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch(body({ not: "turns" }))).toThrow(SHAPE_CHANGED);
    expect(() => parseBatch(body("[not json"))).toThrow(SHAPE_CHANGED);
  });
});

describe("readToken", () => {
  it("finds SNlM0e in the page's inline script and nothing else", () => {
    const html = `<script>window.WIZ_global_data = {"FdrFJe":"123","SNlM0e":"AKz:1234567890:abc-def_+/=","cfb2h":"x"};</script>`;
    expect(readToken(html)).toBe("AKz:1234567890:abc-def_+/=");
    expect(readToken("<html></html>")).toBeNull();
    expect(readToken(`"SNlM0e":""`)).toBeNull();
  });
});
