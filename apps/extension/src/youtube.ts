// What a YouTube page's own links say about themselves.
//
// Pure, because this is the part that was wrong: a playlist card links to a
// watch URL exactly the way a video card does, so reading every `/watch?v=`
// link as a video filed a playlist's first episode under the playlist's name.
// A wrong file, not a failed one, which is why it went unnoticed.

/** The channel tab that lists playlists rather than videos. */
export const isPlaylistsTab = (pathname: string) => /\/playlists\/?$/.test(pathname);

export interface LinkTarget {
  kind: "video" | "playlist";
  id: string;
}

/**
 * Where a `/watch?v=…` link points, given the list the page itself is showing.
 *
 * A `list` param that is not the page's own list belongs to a playlist card:
 * clicking it starts that playlist at whichever video it opens with, and that
 * video's id is the only one in the href. On a playlist's own page, and in a
 * watch page's queue, every row carries the page's own `list` and is a video.
 */
export function linkTarget(href: string, pageList: string | null): LinkTarget | null {
  let url: URL;
  try {
    url = new URL(href, "https://www.youtube.com");
  } catch {
    return null;
  }
  const video = url.searchParams.get("v");
  if (!video) return null;
  const list = url.searchParams.get("list");
  if (list && list !== pageList) return { kind: "playlist", id: list };
  return { kind: "video", id: video };
}
