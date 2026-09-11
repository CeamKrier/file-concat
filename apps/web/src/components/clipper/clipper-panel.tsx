import { ArrowLeft, Check, ChevronUp, SlidersHorizontal } from "lucide-react";

import { LogoMark } from "~/components/app/logo-mark";
import { cn } from "~/lib/utils";

import { CART, THREAD, VIDEO, weigh } from "./clipper-content";

/**
 * The clipper's side panel, rebuilt in the site's own tokens.
 *
 * Not a screenshot and not a recording. The extension's panel is styled from
 * this stylesheet already (its own CSS says so, and it ships the same two
 * faces), so the palette, radii and type here are the panel's, not a likeness
 * of them. What that buys is a panel that can hold a state and animate between
 * states as the page scrolls, which is the one thing a picture of it cannot do,
 * and which is why this page needs no video.
 *
 * Everything in it is illustrative content in the product's real shapes: real
 * strings where the product has fixed ones ("Cart is empty.", "5 sent. The tab
 * took them."), plausible stand-ins where a live page would supply the words.
 * The measured figures stay in the prose beside it, where they can be sourced.
 */
export type PanelState =
  | "offer"
  | "clipped"
  | "list"
  | "peek"
  | "sent"
  | "watch"
  | "channel"
  | "playlist"
  | "transcript";

type Row = { title: string; meta: string };
type File = (typeof CART)[number];

/** A page that offers a row per item instead of one button for the whole thing.
 *  `taken` is how many of the rows are already in the cart, counted from the
 *  top, because the stagger below reads as one tap after another. */
type Listing = { label: string; rows: Row[]; taken: number };

/**
 * One page the panel is looking at.
 *
 * A single exhaustive record rather than a host map beside a title map beside a
 * row map: a scene is one page, so a new state that forgets its host should be
 * a type error and not a blank line. No title means a page the panel cannot
 * read, which is what the blank state says out loud.
 */
type Scene = {
  host: string;
  title?: string;
  listing?: Listing;
  /** The single offer's own words. "Clip this page" is what the extension says
   *  when the page is just an article, so it is the base case, not a fallback. */
  offer?: string;
  /** The site's own opt-in, echoed back where the panel echoes it: below the
   *  offer, reporting its current state rather than showing the switch. Only
   *  the sites that offer one get a line. */
  echo?: string;
  /** What the cart holds while this scene is on screen. A list rather than a
   *  count, because the homepage scene holds the video alone, which is the
   *  last entry of CART and not a prefix of it. */
  cart: File[];
  /** The last clip taken is open in Peek, over the column. */
  peek?: true;
};

/**
 * A listing shows more rows than the panel is tall, on purpose. The count in
 * the hint above is the page's whole count, so a list that stopped short of the
 * floor would be a badge reading 24 over five rows, which is the one kind of
 * detail a reader checks and then stops trusting the rest of.
 */
const SUBREDDIT_ROWS: Row[] = [
  { title: "What are you working on this week?", meta: "128 points · 94 comments" },
  { title: "Writing a parser without a parser generator", meta: "412 points · 63 comments" },
  { title: "Async cancellation, three years later", meta: "287 points · 141 comments" },
  { title: "Notes from porting a C library", meta: "96 points · 22 comments" },
  { title: "Is there any point to `missing_inline_in_public_items`?", meta: "31 points · 8 comments" },
  { title: "Why `Pin` exists, in one example", meta: "204 points · 47 comments" },
  { title: "Cargo workspaces after two years of use", meta: "158 points · 39 comments" },
  { title: "A slower allocator that is faster in practice", meta: "77 points · 15 comments" },
];

/** A video row's second line is the thumbnail's own duration badge, and nothing
 *  else: the extension recognises it by shape (`youtube.content.ts`), so an
 *  upload date would be a line the real panel never shows. */
const CHANNEL_ROWS: Row[] = [
  { title: VIDEO, meta: "18:42" },
  { title: "The B-tree, one node at a time", meta: "24:05" },
  { title: "Write-ahead logs and why they exist", meta: "15:31" },
  { title: "What a query planner is actually doing", meta: "31:18" },
  { title: "Vacuum, bloat and the cost of MVCC", meta: "27:44" },
  { title: "Indexes that do not help", meta: "20:16" },
  { title: "Isolation levels, demonstrated", meta: "38:09" },
  { title: "Why your ORM emits that query", meta: "16:55" },
];

/** The Playlists tab lists playlists, not videos, and a playlist's badge is
 *  YouTube's own count. Tapping one row is what brings back every video it
 *  holds, which is why this scene is on the page at all. */
const PLAYLIST_ROWS: Row[] = [
  { title: "Distributed systems, from scratch", meta: "38 videos" },
  { title: "How a database is built", meta: "12 videos" },
  { title: "The networking series", meta: "9 videos" },
  { title: "Paper walkthroughs", meta: "24 videos" },
  { title: "One-offs and experiments", meta: "17 videos" },
  { title: "Compilers, the short version", meta: "11 videos" },
  { title: "Storage engines, compared", meta: "7 videos" },
  { title: "Live streams", meta: "31 videos" },
];

/** The one opt-in YouTube reports, in the extension's own words. */
const COMMENTS_OFF = "Include comments: off for this site";

/**
 * The description and transcript of the video, as the clipping holds them and
 * as Peek prints them: the file split on blank lines, every paragraph shown as
 * typed, so a transcript line keeps its `**M:SS**` marks. A shape example, not
 * a real transcript.
 */
const DESCRIPTION = "Pages, heaps, indexes and the B-tree, with the on-disk layout drawn as we go.";
const TRANSCRIPT: [string, string][] = [
  [
    "0:00",
    "Every row you write ends up on a page, and a page is a fixed block of bytes. That constraint is where most of the design comes from.",
  ],
  [
    "0:41",
    "So the question is not really how the row is stored. It is what has to be true for the next read to find it without scanning everything.",
  ],
  [
    "1:27",
    "A heap file answers that with nothing. Rows go wherever there is room, and a read walks every page until it finds the one it wants.",
  ],
  [
    "2:03",
    "An index is the promise that you will not have to. It is a second structure, sorted, that points back into the heap.",
  ],
  [
    "2:50",
    "Most engines pick a B-tree for that structure, and the rest of this video is about why that choice keeps winning.",
  ],
];

const SCENE: Record<PanelState, Scene> = {
  offer: { host: "news.ycombinator.com", title: THREAD, offer: "Clip this thread", cart: [] },
  clipped: {
    host: "news.ycombinator.com",
    title: THREAD,
    offer: "Clip this thread",
    cart: CART.slice(0, 1),
  },
  list: {
    host: "reddit.com",
    title: "The Rust Programming Language",
    listing: { label: "24 on this page. Tap one to clip it.", rows: SUBREDDIT_ROWS, taken: 3 },
    cart: CART.slice(0, 4),
  },
  peek: {
    host: "youtube.com",
    title: VIDEO,
    offer: "Clip this video",
    echo: COMMENTS_OFF,
    cart: CART,
    peek: true,
  },
  // The bundler is the destination, never a source, so it is the one page in
  // the story the panel reports as unreadable.
  sent: { host: "fileconcat.com", cart: CART },

  // The homepage's clipper figure: a watch page one click after "Clip this
  // video", with the clip open in Peek. The cart holds that one clip and
  // nothing before it, so the floor counts one and the peek is of the video.
  transcript: {
    host: "youtube.com",
    title: VIDEO,
    offer: "Clip this video",
    echo: COMMENTS_OFF,
    cart: CART.slice(-1),
    peek: true,
  },

  // The three YouTube pages the use-case section walks between. One channel,
  // three of its pages: the video, the Videos tab, the Playlists tab. Their
  // carts are empty on purpose, because that passage is about the panel keeping
  // up with the page on its own and a count climbing underneath would be a
  // second story competing with it.
  watch: {
    host: "youtube.com",
    title: VIDEO,
    offer: "Clip this video",
    echo: COMMENTS_OFF,
    cart: [],
  },
  channel: {
    host: "youtube.com",
    title: "Systems, Slowly",
    listing: { label: "30 on this page. Tap one to clip it.", rows: CHANNEL_ROWS, taken: 0 },
    echo: COMMENTS_OFF,
    cart: [],
  },
  playlist: {
    host: "youtube.com",
    title: "Systems, Slowly",
    listing: { label: "12 on this page. Tap one to clip it.", rows: PLAYLIST_ROWS, taken: 0 },
    echo: COMMENTS_OFF,
    cart: [],
  },
};

/** What the panel is looking at, ignoring what the cart holds. Two states that
 *  share one page are one page, which is what makes clipping a thread a change
 *  of colour and opening a different tab a change of scene. */
const pageKey = (scene: Scene) =>
  `${scene.host}|${scene.title ?? ""}|${scene.listing?.label ?? scene.offer ?? ""}`;

/** Milliseconds between one row settling into the cart and the next. Slow
 *  enough to read as three separate taps rather than one bulk action. */
const STAGGER = 190;

export function ClipperPanel({ state, className }: { state: PanelState; className?: string }) {
  const scene = SCENE[state];

  return (
    <div
      className={cn(
        "border-border rounded-panel bg-background relative flex h-[540px] flex-col overflow-hidden border shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]",
        className,
      )}
      // The panel is decoration for the prose beside it; the prose carries the
      // same facts, so a screen reader gets them once rather than twice.
      aria-hidden="true"
    >
      <PanelHeader />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Keyed on the page rather than on the state, so the two kinds of
            change read differently: a new page arrives (the panel re-read
            something) and a clip you took stays put and turns colour. Keying on
            `state` would remount on both and lose the second one. */}
        <div
          key={pageKey(scene)}
          className="motion-safe:animate-fade-up flex h-full flex-col px-4 pb-3 pt-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-faint font-mono text-[10px] uppercase tracking-[0.18em]">Now</span>
            <span className="text-ink-muted truncate text-[12px]">{scene.host}</span>
          </div>
          {scene.title ? (
            <>
              <h3 className="font-display text-ink mt-1.5 text-[15px] font-semibold leading-snug">
                {scene.title}
              </h3>
              {scene.listing ? (
                <RowList listing={scene.listing} />
              ) : (
                <SingleOffer
                  label={scene.offer ?? "Clip this page"}
                  inCart={scene.cart.length > 0}
                />
              )}
              {scene.echo ? <Echo label={scene.echo} /> : null}
            </>
          ) : (
            <Blank />
          )}
        </div>

        <PeekSheet open={scene.peek === true} files={scene.cart} />
      </div>

      <PanelFloor state={state} />
      <Toast open={state === "sent"} />
    </div>
  );
}

/** What the panel says on a page it cannot read, which fileconcat.com is: the
 *  bundler is the destination, never a source. The real panel's own words. */
function Blank() {
  return (
    <div className="mt-3">
      <p className="text-ink text-[14px] font-semibold">Nothing to clip here</p>
      <p className="text-ink-faint mt-1.5 max-w-[36ch] text-[12.5px] leading-relaxed">
        Open an article, a video, or a thread and this panel will report what it can read.
      </p>
    </div>
  );
}

function PanelHeader() {
  return (
    <header className="border-hairline flex shrink-0 items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <LogoMark size={18} />
        <span className="font-display text-ink text-[14px] font-semibold tracking-[-0.01em]">
          FileConcat
        </span>
        <span className="text-ink-faint font-mono text-[10px] uppercase tracking-[0.16em]">clipper</span>
      </div>
      <span className="border-hairline text-ink-muted rounded-chip flex items-center gap-1.5 border px-2 py-1 text-[11px]">
        <SlidersHorizontal className="h-3 w-3" strokeWidth={2} />
        Settings
      </span>
    </header>
  );
}

/** The single big offer a thread, an article or a watch page gets. It does not
 *  disappear once clipped; it turns into the way back out. */
function SingleOffer({ label, inCart }: { label: string; inCart: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card mt-4 grid place-items-center px-4 text-center text-[14px] font-semibold",
        "h-11 motion-safe:transition-colors motion-safe:duration-500 motion-safe:ease-out-expo",
        inCart
          ? "border-border text-ink-muted border bg-transparent"
          : "bg-primary text-primary-foreground border border-transparent",
      )}
    >
      {inCart ? "In cart · tap to take it out" : label}
    </div>
  );
}

/** The site's own opt-in, reported rather than offered: the switch itself lives
 *  in Settings, and this line is how the panel says which way it is set. */
function Echo({ label }: { label: string }) {
  return (
    <div className="mt-2.5 flex shrink-0 items-center justify-between gap-2.5">
      <span className="text-ink-muted truncate text-[11.5px]">{label}</span>
      <span className="text-go-fg shrink-0 text-[11.5px] underline underline-offset-2">Change</span>
    </div>
  );
}

function RowList({ listing }: { listing: Listing }) {
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-ink-muted text-[12px]">{listing.label}</span>
        <span className="border-hairline text-ink-muted rounded-chip border px-2 py-0.5 text-[11px]">
          Select
        </span>
      </div>

      {/* The last row is cut by the panel's own height, which is what a list
          longer than the panel looks like. The mask fades that cut so it reads
          as a list continuing rather than as a card sliced in half. */}
      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]">
        {listing.rows.map((row, index) => {
          // The taken rows settle one after another so the count beneath reads
          // as that many taps rather than one bulk action. The delay is
          // declarative rather than a timer, so it cannot drift out of step
          // with the transition it belongs to.
          const taken = index < listing.taken;
          return (
            <li
              key={row.title}
              style={taken ? { transitionDelay: `${index * STAGGER}ms` } : undefined}
              className={cn(
                "rounded-card flex items-center gap-3 border px-3 py-2.5",
                "motion-safe:transition-colors motion-safe:duration-500 motion-safe:ease-out-expo",
                taken ? "border-border bg-surface-alt" : "border-hairline bg-transparent",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-[12.5px] leading-tight">{row.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[11px]",
                    taken ? "text-go-fg" : "text-ink-faint",
                  )}
                >
                  {taken ? "In cart · tap to take it out" : row.meta}
                </span>
              </span>
              <span
                style={taken ? { transitionDelay: `${index * STAGGER}ms` } : undefined}
                className={cn(
                  "text-go-fg shrink-0",
                  "motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out-expo",
                  taken ? "opacity-100" : "opacity-0",
                )}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Peek: the Markdown that came out, read back inside the panel.
 *
 * It slides over the column rather than replacing it, which is what the real
 * sheet does, so the panel never appears to navigate somewhere. The body is
 * the file the way the real Peek prints it: split on blank lines, heading
 * marks stripped, everything else as typed. It runs past the floor and fades
 * out there, which is what a file longer than the panel looks like.
 */
function PeekSheet({ open, files }: { open: boolean; files: File[] }) {
  // The peeked clipping is the one just taken, which is the last in the cart.
  // A scene with an empty cart never opens the sheet, so the video stands in
  // while it is off screen.
  const file = files[files.length - 1] ?? CART[CART.length - 1];

  return (
    <div
      className={cn(
        "bg-background absolute inset-0 flex flex-col",
        "motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out-expo",
        open ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="border-hairline flex items-center gap-2 border-b px-3.5 py-2.5">
        <span className="text-ink-secondary flex shrink-0 items-center gap-1 text-[11.5px] font-semibold">
          <ArrowLeft className="h-3 w-3" strokeWidth={2.4} />
          Back
        </span>
        <span className="text-ink-muted min-w-0 flex-1 truncate font-mono text-[10.5px]">
          {file.name}
        </span>
        <span className="text-code shrink-0 font-mono text-[10.5px] font-semibold">~{file.tokens}k</span>
        <span className="bg-surface-alt border-border text-ink-secondary shrink-0 rounded-[6px] border px-[9px] py-1 text-[10.5px] font-semibold">
          Copy
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3.5 pt-3.5 [mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]">
        <div className="flex max-w-[60ch] flex-col gap-[11px]">
          <p className="font-display text-ink text-[14px] font-semibold leading-[1.3]">{VIDEO}</p>
          <p className="text-ink-faint text-[11px]">Clipped from youtube.com · Markdown</p>
          <p className="text-ink-faint break-all font-mono text-[10.5px] leading-[1.7]">
            title: "{VIDEO}"
            <br />
            source: "https://www.youtube.com/watch?v=8kZ3tPq1vRw"
            <br />
            tags: ["clippings"]
          </p>
          <p className="text-ink-secondary text-[13px] leading-[1.62]">{DESCRIPTION}</p>
          <p className="font-display text-ink text-[13px] font-semibold">Transcript</p>
          {TRANSCRIPT.map(([at, text]) => (
            <p key={at} className="text-ink-secondary text-[13px] leading-[1.62]">
              {`**${at}** - ${text}`}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The floor: empty until something is in the cart, then the cart bar, then the
 *  cart itself opened over the column. */
function PanelFloor({ state }: { state: PanelState }) {
  if (state === "sent") return <OpenCart />;

  const files = SCENE[state].cart;
  const count = files.length;
  return (
    <div className="border-hairline shrink-0 border-t px-4 py-3">
      <div
        className={cn(
          "flex items-center gap-3",
          "motion-safe:transition-opacity motion-safe:duration-500",
        )}
      >
        {count === 0 ? (
          <span className="text-ink-faint text-[12px]">
            Cart is empty. Clips collect here until you send them.
          </span>
        ) : (
          <>
            <span className="bg-primary text-primary-foreground grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums">
              {count}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[12.5px] leading-tight">
                {count} {count === 1 ? "clip" : "clips"} in the cart
              </span>
              <span className="text-ink-faint block font-mono text-[11px]">
                {weigh(files)} tokens
              </span>
            </span>
            <span className="bg-primary text-primary-foreground rounded-chip flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11.5px] font-semibold">
              Review
              <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function OpenCart() {
  return (
    <div className="border-hairline bg-surface-alt shrink-0 border-t px-4 pb-4 pt-3">
      <div className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums">
          {CART.length}
        </span>
        <span className="text-ink text-[12.5px]">In the cart</span>
      </div>

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {CART.map((file) => (
          <li
            key={file.name}
            className="border-hairline rounded-card flex items-center gap-3 border px-3 py-2"
          >
            <span className="text-ink-secondary min-w-0 flex-1 truncate font-mono text-[11px]">
              {file.name}
            </span>
            <span className="text-ink-faint shrink-0 font-mono text-[11px]">~{file.tokens}k</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-ink-faint font-mono text-[11px]">{weigh(CART)} tokens</span>
        <span className="bg-primary text-primary-foreground rounded-chip px-4 py-1.5 text-[12.5px] font-semibold">
          Send
        </span>
      </div>
    </div>
  );
}

/** The one line the panel says out loud, and the only moment anything leaves
 *  the browser. */
function Toast({ open }: { open: boolean }) {
  return (
    <div
      className={cn(
        "border-border bg-surface-inset rounded-card absolute inset-x-4 top-4 flex items-center gap-2.5 border px-3 py-2.5",
        "motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out-expo",
        open ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
      )}
    >
      <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
      <span className="text-ink text-[12.5px]">{CART.length} sent. The tab took them.</span>
    </div>
  );
}
