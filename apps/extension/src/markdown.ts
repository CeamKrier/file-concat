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
  likes: string;
  text: string;
  isCreator: boolean;
  /** 0 for a thread's own comment, 1 for a reply. YouTube has no third level:
   *  a reply to a reply is filed at 1 with an @mention in its text. */
  depth: number;
  /** How many replies the thread has in total, on its top-level comment only.
   *  Written down because we take the first page of them and no more. */
  replyTotal?: string;
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
  /** Top-ranked threads with their replies, flat and in reading order. Empty
   *  when comments are turned off. */
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

  const transcript = clip.segments.map((segment) => `**${segment.timestamp}** - ${segment.text}`).join("\n\n");

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
  const threads = clip.comments.filter((comment) => comment.depth === 0).length;
  const replies = clip.comments.length - threads;
  const heading = `_${total}top ${threads} shown${replies ? ` with ${replies} of their replies` : ""}._`;
  const blocks = clip.comments.map((comment) => {
    // Same two spaces per level as Reddit and HN. A reply is indented under the
    // comment it answers, which is the only structure YouTube's comments have.
    const indent = comment.depth > 0 ? "  " : "";
    const badges = [
      comment.isCreator ? "creator" : null,
      `${comment.likes} likes`,
      // Only ever on a thread's own comment, and it is the count YouTube shows
      // rather than the number under it here — the two differ on any thread
      // past the first reply page.
      comment.replyTotal ? `${comment.replyTotal} replies` : null,
    ]
      .filter(Boolean)
      .join(" - ");
    // A comment can carry its own blank lines; collapsing them keeps one
    // comment reading as one block.
    const text = comment.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
    return `${indent}**${comment.author}** - ${badges}\n${text}`;
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

  const facts = `${clip.subreddit} - ${clip.score} points - ${clip.commentTotal} comments`;
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
    const badges = [`${comment.score} points`, isoDate(comment.created)].filter(Boolean).join(" - ");
    const text = comment.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
    return `${indent}**u/${comment.author}** - ${badges}\n${text}`;
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

  const parts = [`${frontmatter}\n![](${url})`, `_${clip.points} points - ${clip.comments.length} comments_`];
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
      return `${indent}**${comment.author}** - ${isoDate(comment.created)}\n${text}`;
    })
    .join("\n\n");
}

/**
 * Windows-hostile characters plus the separators that would turn one clipping
 * into a folder. Length is capped well under any filesystem limit because the
 * name is prefixed with a folder in batch clips.
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
 * grouped so FileConcat's file tree shows it as a folder — under the channel or
 * subreddit it came from, or under the playlist, when that is what was picked.
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

/**
 * Characters that tokenize at roughly one token each. One flat ratio cannot
 * cover both scripts, and the gap is not small.
 */
const DENSE_SCRIPT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;

/**
 * What a clipping will cost, without shipping a tokenizer into the panel.
 *
 * Measured against tiktoken `o200k_base` on 2026-09-07. Article-shaped markdown
 * runs 4.05 to 4.35 characters per token and Turkish prose 3.71, so the flat 4
 * this used to be is fine for Latin script. It is not fine anywhere else:
 * Chinese runs 1.54, Japanese 1.35 and Korean 1.77, and a Chinese-language
 * repository in the 60-repository bundle measurement came out at 1.50 for the
 * whole bundle. A flat 4 reports a Chinese article at 39% of its real cost.
 *
 * Splitting the two scripts fixes that case and changes nothing for Latin text.
 * The panel still marks the figure with a tilde: the exact count is the tab's
 * job once the batch lands, and an unmarked approximation would be a lie.
 */
export function estimateTokens(markdown: string): number {
  const dense = markdown.match(DENSE_SCRIPT)?.length ?? 0;
  return Math.ceil(dense / 1.5 + (markdown.length - dense) / 4);
}

// ---------- LLM conversations (ChatGPT, Claude) ----------
//
// One block list for every vendor, one renderer. A reader (chatgpt.ts,
// claude.ts) walks the vendor's JSON into these; the file it becomes is the
// same shape for both, so a reader that understands one understands the other.

export type ChatBlock =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  /** Thought summaries with optional bodies, plus free-text reasoning (a ChatGPT
   *  preamble, or Claude's thinking text) rendered as a paragraph after them. */
  | { kind: "reasoning"; entries: { summary: string; body: string }[]; preamble: string }
  | { kind: "call"; tool: string; language: string; text: string }
  | { kind: "output"; tool: string; text: string }
  /** ChatGPT's "Worked for 1m 38s" line. */
  | { kind: "recap"; text: string };

export interface ChatClipping {
  /** The page URL for this conversation: the frontmatter source and the banner image. */
  source: string;
  /** The name on the assistant turn marker: ChatGPT, Claude. */
  assistant: string;
  title: string;
  /** Every model slug seen, the conversation's default first. */
  models: string[];
  /** First user message's timestamp as ISO; empty when the JSON has none. */
  started: string;
  /** Number of `user` blocks. */
  turns: number;
  /** The opt-in: reasoning and tool activity are in `blocks`. */
  activity: boolean;
  blocks: ChatBlock[];
  /** Tool outputs the vendor redacted, counted only with the opt-in on. */
  redacted: number;
  /** Messages of a type this reader does not know, by type. Named at the end
   *  of the file rather than dropped in silence (ADR-0004). */
  skipped: Record<string, number>;
  clippedOn: string;
}

/**
 * A fence longer than any backtick run inside the body. A tool call that writes
 * a Markdown file carries fences of its own, and three backticks around it
 * would end the block at the first one.
 */
export function fence(text: string, language = ""): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${language}\n${text}\n${ticks}`;
}

/**
 * Adjacent assistant blocks become one, so the file shows one turn marker per
 * answer once the activity between them is filtered out; adjacent reasoning
 * blocks become one list. Everything else keeps its own block.
 */
export function mergeChatBlocks(blocks: ChatBlock[]): ChatBlock[] {
  const merged: ChatBlock[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last?.kind === "assistant" && block.kind === "assistant") {
      merged[merged.length - 1] = { kind: "assistant", text: `${last.text}\n\n${block.text}` };
    } else if (last?.kind === "reasoning" && block.kind === "reasoning") {
      merged[merged.length - 1] = {
        kind: "reasoning",
        entries: [...last.entries, ...block.entries],
        preamble: [last.preamble, block.preamble].filter(Boolean).join("\n\n"),
      };
    } else {
      merged.push(block);
    }
  }
  return merged;
}

function renderReasoning(block: Extract<ChatBlock, { kind: "reasoning" }>): string {
  const bullets = block.entries.map((entry) => {
    const head = `- ${entry.summary}`;
    if (!entry.body) return head;
    // Every line of a body indented two spaces under its summary keeps a
    // multi-line body inside the bullet.
    return `${head}\n${entry.body.split("\n").map((line) => `  ${line}`).join("\n")}`;
  });
  const parts: string[] = [];
  if (bullets.length) parts.push(bullets.join("\n"));
  if (block.preamble) parts.push(block.preamble);
  return parts.join("\n\n");
}

/**
 * Turn markers are bold lines, never headings: assistant Markdown carries its
 * own `#` headings and a `## User` would read as one of them. The assistant's
 * marker is written once per answer, ahead of whatever activity precedes the
 * text, and `---` separates turns.
 */
function renderChatBlocks(clip: ChatClipping): string {
  const parts: string[] = [];
  let markerDue = true;
  for (const block of clip.blocks) {
    if (block.kind === "user") {
      if (parts.length) parts.push("---");
      parts.push("**User**", block.text);
      markerDue = true;
      continue;
    }
    if (markerDue) {
      parts.push(`**${clip.assistant}**`);
      markerDue = false;
    }
    switch (block.kind) {
      case "assistant":
        parts.push(block.text);
        break;
      case "reasoning":
        parts.push("_Reasoning_", renderReasoning(block));
        break;
      case "call":
        parts.push(`_Call: ${block.tool}_`, fence(block.text, block.language));
        break;
      case "output":
        parts.push(`_Output: ${block.tool}_`, fence(block.text));
        break;
      case "recap":
        parts.push(`_${block.text}_`);
        break;
    }
  }
  return parts.join("\n\n");
}

export function renderChatClipping(clip: ChatClipping): string {
  const firstUser = clip.blocks.find((block) => block.kind === "user");
  const frontmatter = [
    "---",
    `title: ${yamlString(clip.title)}`,
    `source: ${yamlString(clip.source)}`,
    "author:",
    `  - ${yamlString(`[[${clip.assistant}]]`)}`,
    `published: ${clip.started ? isoDate(clip.started) : ""}`,
    `created: ${clip.clippedOn}`,
    `description: ${yamlString((firstUser?.text ?? "").slice(0, DESCRIPTION_PREVIEW_CHARS))}`,
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n");

  const activity = clip.activity
    ? `reasoning and tool activity included${clip.redacted ? `, ${clip.redacted} redacted tool outputs not shown` : ""}`
    : "reasoning and tool activity left out";
  const facts = `_${clip.models.join(", ")} - ${clip.turns} turns - ${activity}_`;

  const parts = [`${frontmatter}\n![](${clip.source})`, facts, renderChatBlocks(clip)];
  const skipped = Object.entries(clip.skipped);
  if (skipped.length) {
    const named = skipped.map(([type, count], index) =>
      index === 0 ? `${count} ${count === 1 ? "message" : "messages"} of type ${type}` : `${count} of type ${type}`,
    );
    parts.push(`_Not rendered: ${named.join(", ")}._`);
  }
  return parts.join("\n\n") + "\n";
}
