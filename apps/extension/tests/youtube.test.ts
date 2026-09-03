import { describe, expect, it } from "vitest";
import { isPlaylistsTab, linkTarget, scale } from "../src/youtube";

describe("linkTarget", () => {
  it("reads a plain video card as a video", () => {
    expect(linkTarget("/watch?v=abc123", null)).toEqual({ kind: "video", id: "abc123" });
  });

  it("reads a playlist card on the Playlists tab as its playlist", () => {
    // The card's title link, measured on a channel's Playlists tab: it carries
    // the first video's id, which is what used to be clipped under the
    // playlist's name.
    expect(linkTarget("/watch?v=first1&list=PLabc", null)).toEqual({
      kind: "playlist",
      id: "PLabc",
    });
  });

  it("reads a row on a playlist's own page as a video", () => {
    expect(linkTarget("/watch?v=abc123&list=PLabc", "PLabc")).toEqual({
      kind: "video",
      id: "abc123",
    });
  });

  it("reads a link to another playlist on a playlist page as that playlist", () => {
    expect(linkTarget("/watch?v=abc123&list=PLother", "PLabc")).toEqual({
      kind: "playlist",
      id: "PLother",
    });
  });

  it("takes an absolute href", () => {
    expect(linkTarget("https://www.youtube.com/watch?v=abc123", null)).toEqual({
      kind: "video",
      id: "abc123",
    });
  });

  it("is null where there is no video id", () => {
    expect(linkTarget("/watch?list=PLabc", null)).toBeNull();
    expect(linkTarget("not a url at all", null)).toBeNull();
  });
});

describe("isPlaylistsTab", () => {
  it("is true on a handle's and a channel's Playlists tab", () => {
    expect(isPlaylistsTab("/@academind/playlists")).toBe(true);
    expect(isPlaylistsTab("/channel/UC4RjYdg470s1mrkF1h61zlQ/playlists")).toBe(true);
  });

  it("is false on the Videos tab, a playlist page and a watch page", () => {
    expect(isPlaylistsTab("/@academind/videos")).toBe(false);
    expect(isPlaylistsTab("/playlist")).toBe(false);
    expect(isPlaylistsTab("/watch")).toBe(false);
  });
});

describe("scale", () => {
  it("reads the counts YouTube writes on a reply button", () => {
    // Only ever compared with another one of these, to decide which threads are
    // worth a request of their own.
    expect(scale("963")).toBe(963);
    expect(scale("1.2K")).toBe(1200);
    expect(scale("1,204")).toBe(1204);
    expect(scale("3M")).toBe(3_000_000);
  });

  it("is zero for a thread that reports nothing, so it sorts last", () => {
    expect(scale(undefined)).toBe(0);
    expect(scale("")).toBe(0);
    expect(scale("some replies")).toBe(0);
  });
});
