// Renders a clipping as the Markdown that reaches FileConcat. The extension
// sends finished `.md` files, never structured records, so this module is the
// whole contract with the web app (ADR-0018).
//
// The frontmatter shape mirrors obsidian-clipper: a `[[wikilink]]` author, a
// `clippings` tag, and a `description` truncated mid-sentence around 200
// characters. Those are Obsidian conventions rather than anything an LLM wants,
// and they are deliberate.

export interface TranscriptSegment {
  /** Already formatted by YouTube as `M:SS` or `H:MM:SS`. */
  timestamp: string;
  text: string;
}

export interface Comment {
  author: string;
  /** Already humanised by YouTube: "10 months ago". */
  publishedTime: string;
  likes: string;
  text: string;
  isCreator: boolean;
}

export interface YouTubeClipping {
  videoId: string;
  title: string;
  author: string;
  /** Full video description, newlines intact. */
  description: string;
  /** `microformat.playerMicroformatRenderer.publishDate`, an ISO timestamp. */
  publishDate: string;
  segments: TranscriptSegment[];
  /** Top-ranked comments, top level only. Empty when they are turned off. */
  comments: Comment[];
  /** How many the video has in total, e.g. "994", against the few we took. */
  commentTotal?: string;
  /** Clip date as `YYYY-MM-DD`. */
  clippedOn: string;
}

const DESCRIPTION_PREVIEW_CHARS = 200;

/** YAML double-quoted scalar. Newlines would break the one-line form. */
function yamlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s*\n\s*/g, " ");
  return `"${escaped}"`;
}

/**
 * `2025-04-09T04:30:27-07:00` -> `2025-04-09`. Sliced rather than parsed on
 * purpose: parsing re-anchors the timestamp to UTC and can move the date a day
 * off what YouTube itself shows.
 */
function isoDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Markdown hard line breaks are two trailing spaces. Only a line that is
 * actually continued needs one, so blank lines and the ones before them stay
 * clean.
 */
function hardBreaks(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line, index) => (line.trim() && lines[index + 1]?.trim() ? `${line}  ` : line))
    .join("\n")
    .trimEnd();
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function renderYouTubeClipping(clip: YouTubeClipping): string {
  const url = watchUrl(clip.videoId);
  const frontmatter = [
    "---",
    `title: ${yamlString(clip.title)}`,
    `source: ${yamlString(url)}`,
    "author:",
    `  - ${yamlString(`[[${clip.author}]]`)}`,
    `published: ${isoDate(clip.publishDate)}`,
    `created: ${clip.clippedOn}`,
    `description: ${yamlString(clip.description.slice(0, DESCRIPTION_PREVIEW_CHARS))}`,
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n");

  const transcript = clip.segments.map((segment) => `**${segment.timestamp}** · ${segment.text}`).join("\n\n");

  const parts = [`${frontmatter}\n![](${url})`, hardBreaks(clip.description), "## Transcript", transcript];
  if (clip.comments.length > 0) parts.push("## Comments", renderComments(clip));
  return parts.join("\n\n") + "\n";
}

/**
 * Says how many were taken out of how many exist, because a reader who is not
 * told will assume these are all of them.
 */
function renderComments(clip: YouTubeClipping): string {
  const total = clip.commentTotal ? `${clip.commentTotal} in total, ` : "";
  const heading = `_${total}top ${clip.comments.length} shown._`;
  const blocks = clip.comments.map((comment) => {
    const badges = [comment.isCreator ? "creator" : null, `${comment.likes} likes`, comment.publishedTime]
      .filter(Boolean)
      .join(" · ");
    // A comment can carry its own blank lines; collapsing them keeps one
    // comment reading as one block.
    const text = comment.text.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
    return `**${comment.author}** · ${badges}\n${text}`;
  });
  return [heading, ...blocks].join("\n\n");
}

export interface RedditComment {
  author: string;
  /** ISO timestamp from the `created` attribute. */
  created: string;
  score: string;
  /** 0 for a top-level comment; nesting is rendered as indentation. */
  depth: number;
  text: string;
}

export interface RedditClipping {
  id: string;
  title: string;
  author: string;
  /** With the `r/` prefix, as Reddit writes it. */
  subreddit: string;
  score: string;
  /** ISO timestamp from the post's `created-timestamp`. */
  created: string;
  permalink: string;
  /** The post's own text. Empty for a link or image post. */
  body: string;
  /** Where a link post points, when that is not Reddit itself. */
  linkUrl?: string;
  comments: RedditComment[];
  /** How many the post has in total, against however many we could reach. */
  commentTotal: number;
  /**
   * False when the clipping was taken from a listing rather than the thread,
   * where comments are not in the markup at all. The difference has to reach
   * the reader: no comments and "we never looked" are not the same claim.
   */
  commentsAvailable: boolean;
  clippedOn: string;
}

export function redditUrl(permalink: string): string {
  return `https://www.reddit.com${permalink}`;
}

export function renderRedditClipping(clip: RedditClipping): string {
  const url = redditUrl(clip.permalink);
  const frontmatter = [
    "---",
    `title: ${yamlString(clip.title)}`,
    `source: ${yamlString(url)}`,
    "author:",
    `  - ${yamlString(`[[u/${clip.author}]]`)}`,
    `published: ${isoDate(clip.created)}`,
    `created: ${clip.clippedOn}`,
    `description: ${yamlString(clip.body.slice(0, DESCRIPTION_PREVIEW_CHARS))}`,
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n");

  const facts = `${clip.subreddit} · ${clip.score} points · ${clip.commentTotal} comments`;
  const parts = [`${frontmatter}\n![](${url})`, `_${facts}_`];
  if (clip.linkUrl) parts.push(`[${clip.linkUrl}](${clip.linkUrl})`);
  if (clip.body.trim()) parts.push(hardBreaks(clip.body));
  parts.push("## Comments", renderRedditComments(clip));
  return parts.join("\n\n") + "\n";
}

/**
 * Nesting is two spaces per level of `depth`, which is Markdown's own way of
 * saying "this replies to that" and survives being flattened into a prompt.
 */
function renderRedditComments(clip: RedditClipping): string {
  if (!clip.commentsAvailable) {
    return `_Not read: this was clipped from a listing, where the ${clip.commentTotal} comments are not on the page. Open the thread to clip them._`;
  }
  if (clip.comments.length === 0) {
    return clip.commentTotal === 0 ? "_None._" : `_None loaded, of ${clip.commentTotal}._`;
  }
  const heading = `_${clip.commentTotal} in total, ${clip.comments.length} on the page._`;
  const blocks = clip.comments.map((comment) => {
    const indent = "  ".repeat(Math.min(comment.depth, 8));
    const badges = [`${comment.score} points`, isoDate(comment.created)].filter(Boolean).join(" · ");
    const text = comment.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
    return `${indent}**u/${comment.author}** · ${badges}\n${text}`;
  });
  return [heading, ...blocks].join("\n\n");
}

export interface ArticleClipping {
  title: string;
  /** Readability's byline, or the page's own author meta. Often absent. */
  author: string;
  siteName: string;
  url: string;
  /** ISO-ish, straight from the page. Empty when it publishes no date. */
  published: string;
  excerpt: string;
  /** The article body, already Markdown. */
  body: string;
  clippedOn: string;
}

export function renderArticleClipping(clip: ArticleClipping): string {
  const frontmatter = [
    "---",
    `title: ${yamlString(clip.title)}`,
    `source: ${yamlString(clip.url)}`,
    "author:",
    // A page with no byline gets the publication, because "who said this" is
    // the question the field answers and the site is the honest fallback.
    `  - ${yamlString(`[[${clip.author || clip.siteName}]]`)}`,
    `published: ${clip.published ? isoDate(clip.published) : ""}`,
    `created: ${clip.clippedOn}`,
    `description: ${yamlString(clip.excerpt.slice(0, DESCRIPTION_PREVIEW_CHARS))}`,
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n");

  return [`${frontmatter}\n![](${clip.url})`, clip.body].join("\n\n") + "\n";
}

export interface HnComment {
  author: string;
  created: string;
  /** 0 for a top-level comment; nesting is rendered as indentation. */
  depth: number;
  text: string;
}

export interface HnClipping {
  id: string;
  title: string;
  author: string;
  created: string;
  points: number;
  /** Where a link submission points. Absent for an Ask HN or a text post. */
  url?: string;
  /** The submission's own text, for an Ask HN. */
  text: string;
  comments: HnComment[];
  clippedOn: string;
}

export function hnUrl(id: string): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export function renderHnClipping(clip: HnClipping): string {
  const url = hnUrl(clip.id);
  const frontmatter = [
    "---",
    `title: ${yamlString(clip.title)}`,
    `source: ${yamlString(url)}`,
    "author:",
    `  - ${yamlString(`[[${clip.author}]]`)}`,
    `published: ${isoDate(clip.created)}`,
    `created: ${clip.clippedOn}`,
    `description: ${yamlString(clip.text.slice(0, DESCRIPTION_PREVIEW_CHARS))}`,
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n");

  const parts = [`${frontmatter}\n![](${url})`, `_${clip.points} points · ${clip.comments.length} comments_`];
  if (clip.url) parts.push(`[${clip.url}](${clip.url})`);
  if (clip.text.trim()) parts.push(hardBreaks(clip.text));
  parts.push("## Comments", renderHnComments(clip.comments));
  return parts.join("\n\n") + "\n";
}

/**
 * The whole tree, nested by indentation. Unlike Reddit and YouTube there is no
 * "of how many" to state: Algolia returns every comment the thread has, so the
 * count in the header is the count.
 */
function renderHnComments(comments: HnComment[]): string {
  if (comments.length === 0) return "_None._";
  return comments
    .map((comment) => {
      const indent = "  ".repeat(Math.min(comment.depth, 8));
      const text = comment.text
        .replace(/\n{2,}/g, "\n")
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
      return `${indent}**${comment.author}** · ${isoDate(comment.created)}\n${text}`;
    })
    .join("\n\n");
}

/**
 * Windows-hostile characters plus the separators that would turn one clipping
 * into a folder. Length is capped well under any filesystem limit because the
 * name is prefixed with a channel folder in batch clips.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120)
    .trim();
  return cleaned || "untitled";
}

/**
 * Single clips land at the root so they read as one dropped file; a batch is
 * grouped under the channel so FileConcat's file tree shows it as a folder.
 */
export function clippingPath(title: string, channel?: string): string {
  const file = `${sanitizeFilename(title)}.md`;
  return channel ? `${sanitizeFilename(channel)}/${file}` : file;
}

/**
 * Two clippings can land on one path — two posts titled alike in one subreddit,
 * or two articles from different sites that share a headline, since the tray
 * collects across pages before a single send. The web app keys a pushed batch by
 * path, so a collision is not a clash the user sees but a file that quietly
 * never arrives. The first occurrence keeps the name and later ones take `-2`,
 * `-3`; the item id is no good as the suffix because an article's id is its
 * whole URL. The loop is there for the list that already contains a real `X-2`.
 */
export function uniquePaths(clippings: Clipping[]): Clipping[] {
  const taken = new Set<string>();
  return clippings.map((clipping) => {
    let path = clipping.path;
    // Rebuilt from the stem rather than by substituting into the name: a path
    // that does not end in `.md` would leave a `replace` unmatched, the string
    // unchanged and this loop spinning forever inside the service worker.
    for (let n = 2; taken.has(path); n++) path = `${clipping.path.replace(/\.md$/, "")}-${n}.md`;
    taken.add(path);
    return path === clipping.path ? clipping : { ...clipping, path };
  });
}

/**
 * A rendered clipping: the `.md` file that crosses over to fileconcat.com, plus
 * the bit of provenance the tray needs to list it.
 */
export interface Clipping {
  path: string;
  markdown: string;
  source: string;
  clippedAt: number;
  /**
   * A read that could not reach everything the source has — a Reddit post taken
   * from a listing, where the comments are not in the markup. Set so a poorer
   * read never overwrites a richer one already in the tray.
   */
  partial?: boolean;
}
