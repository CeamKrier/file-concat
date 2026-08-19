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
 * A rendered clipping: the `.md` file that crosses over to fileconcat.com, plus
 * the bit of provenance the tray needs to list it.
 */
export interface Clipping {
  path: string;
  markdown: string;
  source: string;
  clippedAt: number;
}
