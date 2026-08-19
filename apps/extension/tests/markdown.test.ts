import { describe, expect, it } from "vitest";
import {
  clippingPath,
  renderHnClipping,
  renderRedditClipping,
  renderYouTubeClipping,
  sanitizeFilename,
} from "../src/markdown";
import { turndown } from "../src/article";

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

describe("renderRedditClipping", () => {
  const base = {
    id: "1vsf9eg",
    title: "Thoughts About Scaling Law",
    author: "pmttyji",
    subreddit: "r/LocalLLaMA",
    score: "238",
    created: "2026-08-19T07:18:00.945000+0000",
    permalink: "/r/LocalLLaMA/comments/1vsf9eg/thoughts/",
    body: "Scaling, but not only of parameters.",
    comments: [],
    commentTotal: 36,
    commentsAvailable: true,
    clippedOn: "2026-08-19",
  };

  it("matches the YouTube clipping's frontmatter shape", () => {
    const md = renderRedditClipping(base);
    expect(md).toContain('title: "Thoughts About Scaling Law"');
    expect(md).toContain('source: "https://www.reddit.com/r/LocalLLaMA/comments/1vsf9eg/thoughts/"');
    expect(md).toContain('  - "[[u/pmttyji]]"');
    expect(md).toContain("published: 2026-08-19");
    expect(md).toContain('  - "clippings"');
  });

  it("nests replies by depth", () => {
    const md = renderRedditClipping({
      ...base,
      comments: [
        { author: "a", created: "2026-08-19T00:00:00+0000", score: "9", depth: 0, text: "top" },
        { author: "b", created: "2026-08-19T00:00:00+0000", score: "2", depth: 1, text: "reply" },
      ],
    });
    expect(md).toContain("**u/a** · 9 points");
    expect(md).toContain("  **u/b** · 2 points");
    // The count it took against the count that exists, so nobody reads 2 of 36
    // as all of them.
    expect(md).toContain("_36 in total, 2 on the page._");
  });

  it("says a listing clip never looked, rather than implying there were none", () => {
    const md = renderRedditClipping({ ...base, commentsAvailable: false });
    expect(md).toContain("Not read: this was clipped from a listing");
    expect(md).not.toContain("_None._");
  });

  it("distinguishes a thread with no comments from one whose comments did not load", () => {
    expect(renderRedditClipping({ ...base, commentTotal: 0 })).toContain("_None._");
    expect(renderRedditClipping({ ...base, commentTotal: 12 })).toContain("_None loaded, of 12._");
  });

  it("keeps a link post's destination and drops a self-post's", () => {
    expect(renderRedditClipping({ ...base, linkUrl: "https://example.com/x" })).toContain(
      "[https://example.com/x](https://example.com/x)",
    );
    expect(renderRedditClipping(base)).not.toContain("](https://example.com");
  });
});

describe("article turndown", () => {
  const md = (html: string, base = "https://example.com/post") => turndown(base).turndown(html);

  it("drops a same-origin href and keeps its text", () => {
    // A path on this site that the anchor text already names is pure token
    // cost in a bundle billed by the token.
    expect(md('<p>see <a href="/other">the other page</a></p>')).toBe("see the other page");
    expect(md('<p><a href="https://example.com/x">absolute same origin</a></p>')).toBe("absolute same origin");
  });

  it("keeps an external href, which points somewhere the prose does not say", () => {
    expect(md('<p><a href="https://elsewhere.org/x">elsewhere</a></p>')).toBe("[elsewhere](https://elsewhere.org/x)");
  });

  it("keeps a mailto but never a javascript: href", () => {
    // `javascript:void(0)` parses as a valid URL with a null origin, so an
    // origin comparison alone would keep it and the clipping would carry a
    // dead link dressed as a citation.
    expect(md('<p><a href="javascript:void(0)">click</a></p>')).toBe("click");
    expect(md('<p><a href="mailto:a@b.c">mail</a></p>')).toBe("[mail](mailto:a@b.c)");
  });

  it("flattens a bare fragment, which is same-origin by definition", () => {
    expect(md('<p><a href="#notes">see notes</a></p>')).toBe("see notes");
  });

  it("keeps a figure's caption and drops its chrome", () => {
    const out = md("<figure><img src=/a.png><figcaption>A diagram</figcaption></figure>");
    expect(out).toContain("_A diagram_");
    expect(out).not.toContain("a.png");
  });
});

describe("renderHnClipping", () => {
  const base = {
    id: "49345263",
    title: "The Amazon tax",
    author: "herbertl",
    created: "2026-08-18T11:00:00.000Z",
    points: 896,
    text: "",
    comments: [],
    clippedOn: "2026-08-19",
  };

  it("matches the YouTube clipping's frontmatter shape", () => {
    const md = renderHnClipping(base);
    expect(md).toContain('source: "https://news.ycombinator.com/item?id=49345263"');
    expect(md).toContain('  - "[[herbertl]]"');
    expect(md).toContain("published: 2026-08-18");
    expect(md).toContain('  - "clippings"');
  });

  it("nests the tree by depth", () => {
    const md = renderHnClipping({
      ...base,
      comments: [
        { author: "a", created: "2026-08-18T11:00:00.000Z", depth: 0, text: "top" },
        { author: "b", created: "2026-08-18T11:00:00.000Z", depth: 1, text: "reply" },
        { author: "c", created: "2026-08-18T11:00:00.000Z", depth: 2, text: "deeper" },
      ],
    });
    expect(md).toContain("**a** · 2026-08-18\ntop");
    expect(md).toContain("  **b** · 2026-08-18\n  reply");
    expect(md).toContain("    **c** · 2026-08-18\n    deeper");
  });

  it("states no total, because Algolia returns the whole thread", () => {
    // Reddit and YouTube say "N of M"; here the count is the count, and
    // claiming a fraction would be the lie.
    const md = renderHnClipping({
      ...base,
      comments: [{ author: "a", created: "2026-08-18T11:00:00.000Z", depth: 0, text: "x" }],
    });
    expect(md).toContain("_896 points · 1 comments_");
    expect(md).not.toContain("in total");
  });

  it("keeps a link submission's target and an Ask HN's text", () => {
    expect(renderHnClipping({ ...base, url: "https://example.com/a" })).toContain("[https://example.com/a]");
    expect(renderHnClipping({ ...base, text: "What do you use?" })).toContain("What do you use?");
  });
});
