import type { SourceType } from "@fileconcat/core";

/** The source tabs in the import panel (the remote types, never "local"). */
export type ImportTab = "github" | "gitlab" | "bitbucket" | "gist" | "url";

/**
 * What a pasted link resolves to. Drives the live caption, the Fetch button
 * validity, and the normalized URL we hand to the engine.
 */
export type UrlKind = "repo" | "gist" | "page" | "binary" | "bad" | "empty";

export type Classification = {
  kind: UrlKind;
  /** Normalized, fetchable URL. Empty unless kind is repo / gist / page. */
  url: string;
  /** Concrete adapter type to fetch with. Null when the link can't be fetched. */
  sourceType: SourceType | null;
  /** "GitHub" | "GitLab" | "Bitbucket" for repos; bare host for pages. */
  hostName: string;
  /** owner/repo for repos, when derivable. */
  slug?: string;
  /** For binary links: the human file-type word, e.g. "PDF", "image". */
  fileType?: string;
};

const REPO_HOSTS: Record<string, { type: SourceType; name: string }> = {
  "github.com": { type: "github", name: "GitHub" },
  "www.github.com": { type: "github", name: "GitHub" },
  "gitlab.com": { type: "gitlab", name: "GitLab" },
  "www.gitlab.com": { type: "gitlab", name: "GitLab" },
  "bitbucket.org": { type: "bitbucket", name: "Bitbucket" },
  "www.bitbucket.org": { type: "bitbucket", name: "Bitbucket" },
};

/** Where a bare `owner/repo` shorthand points, per active tab. */
const SHORTHAND_HOST: Record<ImportTab, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
  gist: "github.com",
  url: "github.com",
};

/** Extensions that can't be read as text. Maps to a friendly type word. */
const NON_TEXT_EXT: Record<string, string> = {
  // images
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  tiff: "image",
  tif: "image",
  ico: "image",
  heic: "image",
  psd: "Photoshop",
  ai: "Illustrator",
  sketch: "Sketch",
  fig: "Figma",
  // video / audio
  mp4: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  webm: "video",
  mp3: "audio",
  wav: "audio",
  flac: "audio",
  ogg: "audio",
  m4a: "audio",
  // archives
  zip: "archive",
  tar: "archive",
  gz: "archive",
  tgz: "archive",
  rar: "archive",
  "7z": "archive",
  bz2: "archive",
  xz: "archive",
  // documents / office binaries
  pdf: "PDF",
  doc: "document",
  docx: "document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ppt: "slideshow",
  pptx: "slideshow",
  // fonts
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  eot: "font",
  // executables / binaries
  exe: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary",
  bin: "binary",
  dmg: "binary",
  iso: "binary",
  wasm: "binary",
  jar: "binary",
  class: "binary",
};

const unfetchable = (kind: UrlKind, extra?: Partial<Classification>): Classification => ({
  kind,
  url: "",
  sourceType: null,
  hostName: "",
  ...extra,
});

/** The file extension of a URL path, if the last segment actually has one. */
function pathExtension(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/");
  const lastDot = pathname.lastIndexOf(".");
  return lastDot > lastSlash + 1 ? pathname.slice(lastDot + 1).toLowerCase() : "";
}

/**
 * Classify a pasted link without touching the network. Host-first: a known
 * code host is a repo regardless of a repo name that happens to look like a
 * file; binary detection only fires on arbitrary hosts, where a direct
 * image / PDF / archive link is the thing a novice actually pastes by mistake.
 * Tab only matters for `owner/repo` shorthand (which host it lands on).
 */
export function classifyUrl(raw: string, tab: ImportTab): Classification {
  const text = raw.trim();
  if (!text) return unfetchable("empty");

  // owner/repo shorthand: two path-safe segments, no scheme, first segment is
  // not itself a hostname (no dot). Lands on the active tab's code host.
  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text);
  if (shorthand && !text.includes("://") && !shorthand[1].includes(".")) {
    const host = SHORTHAND_HOST[tab];
    const meta = REPO_HOSTS[host] ?? REPO_HOSTS["github.com"];
    const slug = `${shorthand[1]}/${shorthand[2]}`;
    return {
      kind: "repo",
      url: `https://${host}/${slug}`,
      sourceType: meta.type,
      hostName: meta.name,
      slug,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return unfetchable("bad");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return unfetchable("bad");

  const host = parsed.hostname.toLowerCase();
  // Reject anything that isn't a public, named host: localhost, *.local, bare
  // IPs, single-label hosts. Not "fetch failed" — just not a public link yet.
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    !host.includes(".")
  ) {
    return unfetchable("bad");
  }

  if (host === "gist.github.com" || host === "www.gist.github.com") {
    return { kind: "gist", url: parsed.toString(), sourceType: "gist", hostName: "Gist" };
  }

  const repoHost = REPO_HOSTS[host];
  if (repoHost) {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined;
    return {
      kind: "repo",
      url: parsed.toString(),
      sourceType: repoHost.type,
      hostName: repoHost.name,
      slug,
    };
  }

  // Arbitrary public host: a direct binary-file link can't be read as text;
  // everything else is a page we can extract readable text from.
  const ext = pathExtension(parsed.pathname);
  if (ext && NON_TEXT_EXT[ext]) {
    return unfetchable("binary", { fileType: NON_TEXT_EXT[ext] });
  }

  return {
    kind: "page",
    url: parsed.toString(),
    sourceType: "url",
    hostName: host.replace(/^www\./, ""),
  };
}
