import { describe, expect, it } from "vitest";
import { clippingPath, renderYouTubeClipping, sanitizeFilename } from "../src/markdown";

const clip = {
  videoId: "_s2h7X-c2jE",
  title: 'SEO in 2025: How I\'d Learn it if I Were "Starting Over"',
  author: "Ahrefs",
  description: "First line of the description.\nSecond line.\n\nA third paragraph that runs on long enough to be cut.",
  publishDate: "2025-04-09T04:30:27-07:00",
  clippedOn: "2026-08-18",
  segments: [
    { timestamp: "0:00", text: "Since 2009, I've generated hundreds of millions of visitors." },
    { timestamp: "0:04", text: "But for the first time in 17 years, I'm questioning everything." },
  ],
  comments: [],
};

describe("renderYouTubeClipping", () => {
  const markdown = renderYouTubeClipping(clip);

  it("matches the obsidian-clipper frontmatter shape", () => {
    expect(markdown).toBe(
      [
        "---",
        'title: "SEO in 2025: How I\'d Learn it if I Were \\"Starting Over\\""',
        'source: "https://www.youtube.com/watch?v=_s2h7X-c2jE"',
        "author:",
        '  - "[[Ahrefs]]"',
        "published: 2025-04-09",
        "created: 2026-08-18",
        'description: "First line of the description. Second line. A third paragraph that runs on long enough to be cut."',
        "tags:",
        '  - "clippings"',
        "---",
        "![](https://www.youtube.com/watch?v=_s2h7X-c2jE)",
        "",
        "First line of the description.  ",
        "Second line.",
        "",
        "A third paragraph that runs on long enough to be cut.",
        "",
        "## Transcript",
        "",
        "**0:00** · Since 2009, I've generated hundreds of millions of visitors.",
        "",
        "**0:04** · But for the first time in 17 years, I'm questioning everything.",
        "",
      ].join("\n"),
    );
  });

  it("truncates the frontmatter description mid-sentence but keeps the body whole", () => {
    const long = { ...clip, description: "x".repeat(400) };
    const rendered = renderYouTubeClipping(long);
    expect(rendered).toContain(`description: "${"x".repeat(200)}"`);
    expect(rendered).toContain(`\n${"x".repeat(400)}\n`);
  });

  it("keeps the published date YouTube shows rather than re-anchoring to UTC", () => {
    // 04:30 at -07:00 is 11:30 UTC on the same day, but 20:30 at +09:00 would
    // roll over. Slicing the ISO string never moves the day.
    expect(renderYouTubeClipping({ ...clip, publishDate: "2025-04-09T20:30:00+09:00" })).toContain("published: 2025-04-09");
  });
});

describe("renderYouTubeClipping with comments", () => {
  const discussed = renderYouTubeClipping({
    ...clip,
    commentTotal: "994",
    comments: [
      { author: "@viewer", publishedTime: "10 months ago", likes: "36", text: "Line one.\n\n\nLine two.", isCreator: false },
      { author: "@Ahrefs", publishedTime: "1 year ago", likes: "4", text: "Thanks!", isCreator: true },
    ],
  });

  it("says how many were taken out of how many exist", () => {
    expect(discussed).toContain("## Comments\n\n_994 in total, top 2 shown._");
  });

  it("keeps one comment reading as one block and marks the creator", () => {
    expect(discussed).toContain("**@viewer** \u00b7 36 likes \u00b7 10 months ago\nLine one.\nLine two.");
    expect(discussed).toContain("**@Ahrefs** \u00b7 creator \u00b7 4 likes \u00b7 1 year ago\nThanks!");
  });

  it("leaves the section out entirely when comments are off", () => {
    expect(renderYouTubeClipping(clip)).not.toContain("## Comments");
  });
});

describe("clippingPath", () => {
  it("groups a batch under the channel and leaves a single clip at the root", () => {
    expect(clippingPath("How I'd Learn SEO")).toBe("How I'd Learn SEO.md");
    expect(clippingPath("How I'd Learn SEO", "Ahrefs")).toBe("Ahrefs/How I'd Learn SEO.md");
  });

  it("never lets a title escape its folder", () => {
    expect(clippingPath("../../etc/passwd")).toBe("etc-passwd.md");
    expect(sanitizeFilename("C:\\Windows|nul")).toBe("C-Windows-nul");
    expect(sanitizeFilename("   ...   ")).toBe("untitled");
  });
});
