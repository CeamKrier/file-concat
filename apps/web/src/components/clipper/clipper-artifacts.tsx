import { MockWindow } from "~/components/app/marketing/mock-window";

import { CART } from "./clipper-content";

/**
 * The three things a clipping turns into, one per use case beside it.
 *
 * The panel on this page shows the act; these show the result, which is the
 * half a panel cannot show. Each one is the real artifact in its real shape —
 * a clipping's Markdown, the bundle's directory listing, the bundle's file
 * blocks — so a reader who goes and checks finds what they were shown.
 */

/** Mono figure in a window's title bar, in the shape the bundler uses: the
 *  number carries the accent, the unit stays quiet. */
function Figure({ count, weight }: { count?: string; weight: string }) {
  return (
    <span className="font-mono text-[11px]">
      {count ? <span className="text-ink-muted">{count} · </span> : null}
      <span className="text-primary">{weight}</span>
      <span className="text-ink-muted"> tokens</span>
    </span>
  );
}

/** A hair smaller on a phone, where the longest line is a URL and the window is
 *  the width of the screen. It still scrolls sideways past that, the way a code
 *  block does; the size buys back the lines that were only just over. */
const CODE = "overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-[1.7] sm:text-[12px]";

/**
 * Nesting is two spaces per level of depth, which is what `renderHnComments`
 * writes and what survives being flattened into a prompt. A comment that wraps
 * carries its indent on every line, because the shape is the part a stripped
 * copy of the page loses first.
 */
const REPLIES = [
  { depth: 0, author: "quietfox", lines: ["The rule everybody skips is the naming one."] },
  {
    depth: 1,
    author: "anmutig",
    lines: ["We tried enforcing it. Two of the four", "rules were wrong inside a month."],
  },
  { depth: 2, author: "tern", lines: ["Which two?"] },
];

/** A thread, as the file it becomes. The name and the figure come off the same
 *  cart the panel is holding, so the two mocks cannot disagree. */
export function ThreadClipping({ className }: { className?: string }) {
  const clip = CART[0];

  return (
    <MockWindow
      label={clip.name}
      trailing={<Figure weight={`~${clip.tokens}k`} />}
      className={className}
    >
      <pre className={CODE}>
        <code>
          <span className="text-ink-muted">{`## Comments\n\n`}</span>
          {REPLIES.map((reply, index) => {
            const indent = "  ".repeat(reply.depth);
            return (
              <span key={reply.author}>
                {indent}
                <span className="text-ink font-semibold">{`**${reply.author}**`}</span>
                <span className="text-ink-muted">{` - 2026-08-19\n`}</span>
                {reply.lines.map((line) => (
                  <span key={line} className="text-ink-secondary">{`${indent}${line}\n`}</span>
                ))}
                {index < REPLIES.length - 1 ? "\n" : null}
              </span>
            );
          })}
        </code>
      </pre>
    </MockWindow>
  );
}

/** A repository and the pages of documentation about it, in one listing. The
 *  clipped files sit at the root beside the folder you dropped in, because a
 *  single clip lands at the root and is a file like any other. */
const TREE = [
  "|-- src/",
  "|   |-- db/page.rs",
  "|   |-- db/wal.rs",
  "|   `-- lib.rs",
  "|-- Runtime in tokio - Rust.md",
  "`-- Timeouts and cancellation - Tokio.md",
];

export function MixedBundle({ className }: { className?: string }) {
  return (
    <MockWindow
      label="fileconcat-output.txt"
      trailing={<Figure count="5 files" weight="~62.4k" />}
      className={className}
    >
      <pre className={CODE}>
        <code>
          <span className="text-ink-muted">{`## Directory structure\n\n`}</span>
          <span className="text-ink-secondary">{TREE.join("\n")}</span>
        </code>
      </pre>
    </MockWindow>
  );
}

/**
 * Four page shapes, four blocks of one file. The names are what the sanitizer
 * really does to a title, a colon and a slash being two of the characters a
 * filesystem refuses, and the source line is the frontmatter's own: it is how
 * the origin travels with the text once the page is gone.
 */
const SOURCES = [
  { path: "Why we moved off Postgres.md", source: "https://acme.dev/p/off-postgres" },
  { path: "Runtime in tokio - Rust.md", source: "https://docs.rs/tokio/latest/tokio/runtime" },
  { path: "RFC 9114- HTTP-3.md", source: "https://www.rfc-editor.org/rfc/rfc9114" },
  { path: "Changelog - 2026-08-14.md", source: "https://api.acme.dev/changelog" },
];

export function OneBundle({ className }: { className?: string }) {
  return (
    <MockWindow
      label="fileconcat-output.txt"
      trailing={<Figure count="4 files" weight="~31.6k" />}
      className={className}
    >
      <pre className={CODE}>
        <code>
          {SOURCES.map((entry, index) => (
            <span key={entry.path}>
              <span className="text-primary">{`<file `}</span>
              <span className="text-ink-secondary">{`path=`}</span>
              <span className="text-go-fg">{`"${entry.path}"`}</span>
              <span className="text-primary">{`>\n`}</span>
              <span className="text-ink-muted">{`source: `}</span>
              <span className="text-ink-secondary">{`"${entry.source}"\n`}</span>
              <span className="text-primary">{`</file>`}</span>
              {index < SOURCES.length - 1 ? "\n\n" : null}
            </span>
          ))}
        </code>
      </pre>
    </MockWindow>
  );
}
