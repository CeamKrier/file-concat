import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ArrowRight, Lock } from "lucide-react";

import { SiteFooter } from "~/components/app/marketing";
import { MarketingSection } from "~/components/app/marketing/section";
import { LabeledPoints } from "~/components/app/marketing/labeled-points";
import { TopBar } from "~/components/app/top-bar";
import { cn } from "~/lib/utils";

import { ClipperPanel, type PanelState } from "./clipper-panel";

export const STORE_URL =
  "https://chromewebstore.google.com/detail/fileconcat-clipper/nhjmkijlimliapgbidajgbkangddnlhn";

/**
 * /clipper, the extension's own page, and the destination every link to it
 * points at: the store listing's homepage field, the site header, the app.
 *
 * The composition is the product's own arrangement. A real side panel sits at
 * the right edge of the window and stays there while the page beside it
 * changes, so here the reading column runs down the left and one panel sticks
 * to the right, changing state as each beat comes level with it. That is why
 * the panel is built in markup rather than shown as a picture: four screenshots
 * would be four pictures of a panel, and this is the panel.
 *
 * Below the fold the sticky column ends and the page returns to full-width
 * bands, so the reading rhythm has somewhere to land rather than running the
 * same two-column bar all the way down.
 */
export function ClipperPage() {
  const { register, active } = useActiveBeat();

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      {/* No app flow on this page: /clipper sells the extension, and dropping a
          file bundler under it would answer a question nobody arrived with. */}
      <TopBar onStartOver={() => {}} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1040px] px-4 sm:px-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
          <div className="min-w-0">
            <Hero register={register(0)} />
            {BEATS.map((beat, index) => (
              <Beat key={beat.heading} beat={beat} register={register(index + 1)} />
            ))}
          </div>

          {/* One panel for the whole column. `top` clears the 52px header; the
              opening offset is a margin rather than padding, because padding
              would sit inside the sticky box and push the stuck panel down by
              the same amount for the rest of the page. */}
          <aside className="hidden lg:block">
            <div className="sticky top-[92px] mt-16">
              <ClipperPanel state={PANEL_BY_BEAT[active]} />
            </div>
          </aside>
        </div>
      </div>

        <Uses />
        <Everywhere />
        <Nothing />
        <Close />
      </main>

      <SiteFooter />
    </div>
  );
}

/** Which state the panel holds while each beat is the one being read. Index 0
 *  is the hero, so the panel opens on the offer and nothing has happened yet. */
const PANEL_BY_BEAT: PanelState[] = ["offer", "clipped", "list", "peek", "sent"];

/**
 * Tracks which beat is level with the middle of the viewport.
 *
 * The margins collapse the observer's root to a thin band across the middle of
 * the screen, so "active" means the beat the reader is actually level with,
 * not merely one that is somewhere on screen. Between beats nothing intersects
 * and the last value stands, which is what keeps the panel from flickering back
 * to a default in the gaps.
 */
function useActiveBeat() {
  const nodes = useRef(new Map<number, HTMLElement>());
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.beat);
          setActive(index);
        }
      },
      { rootMargin: "-46% 0px -46% 0px", threshold: 0 },
    );
    for (const node of nodes.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const register = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(index, node);
      else nodes.current.delete(index);
    },
    [],
  );

  return { register, active };
}

type BeatCopy = { heading: string; body: string; aside?: string };

const BEATS: BeatCopy[] = [
  {
    heading: "A thread comes out as a thread",
    body: "Copying a page into Markdown is the easy half, and every bookmarklet does it. What is actually hard to get out of a browser is a discussion. Every author, score and level of nesting is kept, so a reply still reads as a reply to the thing above it rather than as one more paragraph.",
    aside: "On Hacker News the whole comment tree arrives in one request, however deep it runs. Measured on a 638-comment thread: 264,851 characters, nested eight levels down, none of which was on screen when the button was pressed.",
  },
  {
    heading: "A listing, one item at a time",
    body: "A subreddit, a Hacker News front page, a YouTube channel or a search page lists what it has loaded, with a tap target on each row. Tap the ones you want and each is opened and read on its own, so a session of scrolling becomes a set of files rather than one flattened page of headlines.",
  },
  {
    heading: "Words that were never on the page",
    body: "A watch page gives you the video's description and its full transcript, which is not text the page was showing to begin with. A channel's Playlists tab lists its playlists, and clipping one clips the videos it holds.",
    aside: "Peek reads the Markdown back inside the panel before you send it, so the two ways a read goes wrong are visible while they are still cheap to fix: the wrong page shows in the first block, and a transcript that stopped early shows in the last.",
  },
  {
    heading: "Then hand it over",
    body: "Press Send and every finished clipping goes into your fileconcat.com tab at once, opening one if there is none. A send adds to the bundle rather than replacing it, and files with the same name replace each other, so a repository and the discussion about it can sit in one bundle, and re-sending a corrected clipping fixes it in place.",
  },
];

function Hero({ register }: { register: (node: HTMLElement | null) => void }) {
  return (
    <section ref={register} data-beat="0" className="pb-4 pt-14 md:pt-16">
      <span className="text-go-fg rounded-pill inline-flex items-center gap-2 border border-[oklch(var(--primary)/0.25)] bg-[oklch(var(--primary)/0.08)] px-3 py-1 font-mono text-[11px]">
        <Lock className="text-primary h-3 w-3" strokeWidth={2.5} />
        Reads a page only when you ask it to.
      </span>

      <h1 className="font-display text-ink mt-6 text-balance text-[clamp(1.9rem,5vw,2.75rem)] font-bold leading-[1.06] tracking-[-0.025em]">
        Whole discussions, not just the page.
      </h1>

      <p className="text-ink-secondary mt-5 max-w-[54ch] text-[16px] leading-relaxed">
        FileConcat Clipper is a browser side panel that turns what you are reading into Markdown and
        hands it to an open fileconcat.com tab, where it joins a bundle you can copy or download in
        one piece. It is for anyone who assembles reading material for an LLM and is tired of
        pasting pages in one at a time.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <a
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground rounded-card focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 px-5 py-2.5 text-[14.5px] font-semibold transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Add to Chrome
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </a>
        <a
          href="https://github.com/CeamKrier/file-concat"
          target="_blank"
          rel="noopener noreferrer"
          className="border-border text-ink-secondary hover:text-ink rounded-card focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 border px-4 py-2.5 text-[14px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <SiGithub className="h-4 w-4" />
          Source
        </a>
      </div>

      {/* The panel rides with the copy on narrow screens, where nothing can be
          sticky beside anything. */}
      <ClipperPanel state="offer" className="mt-10 lg:hidden" />
    </section>
  );
}

function Beat({ beat, register }: { beat: BeatCopy; register: (node: HTMLElement | null) => void }) {
  const index = BEATS.indexOf(beat) + 1;
  return (
    <section
      ref={register}
      data-beat={index}
      className={cn("border-hairline border-t py-14 md:py-16")}
    >
      <h2 className="font-display text-ink text-[clamp(1.35rem,3vw,1.7rem)] font-bold leading-tight tracking-[-0.02em]">
        {beat.heading}
      </h2>
      <p className="text-ink-secondary mt-4 max-w-[54ch] text-[15px] leading-relaxed">{beat.body}</p>
      {beat.aside ? (
        <p className="border-hairline text-ink-muted mt-5 max-w-[54ch] border-l pl-4 text-[14px] leading-relaxed">
          {beat.aside}
        </p>
      ) : null}

      <ClipperPanel state={PANEL_BY_BEAT[index]} className="mt-8 lg:hidden" />
    </section>
  );
}

/**
 * The three YouTube pages the panel walks between, and how long each holds.
 *
 * Long enough to read the title and register that the body underneath changed
 * shape, short enough that a reader who stops here witnesses the change rather
 * than waiting for it.
 */
const CYCLE: PanelState[] = ["watch", "channel", "playlist"];
const CYCLE_MS = 3200;

/**
 * The panel notices a new page on its own. That is the one claim on this page a
 * still picture cannot make, so it is the one thing here that moves by itself
 * rather than in response to the scroll.
 *
 * Reduced motion holds the first scene: the cycle is the motion, and the watch
 * page is the case the prose beside it opens on, so stopping there loses the
 * demonstration and none of the meaning.
 */
function useYouTubeCycle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % CYCLE.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return CYCLE[index];
}

/** The three cases that follow the video one. They get a heading and a
 *  paragraph each and no panel, which is the weighting: one case is worth a
 *  demonstration and the rest are worth a sentence. */
const USES = [
  {
    heading: "A discussion you were not in",
    body: "Someone links you to a thread with six hundred replies, thirty of which are on screen. Take the whole tree with its nesting intact and ask what the disagreement actually was, instead of scrolling for the one comment everybody is quoting.",
  },
  {
    heading: "Documentation, next to the code that uses it",
    body: "Drop the repository into the bundler, clip the pages of the documentation that matter, and both land in the same bundle. The answer you get back is then grounded in the pages you actually read rather than in whatever the model remembers about that library.",
  },
  {
    heading: "One subject, spread across the web",
    body: "A Substack post, a news piece, a vendor's changelog and a specification are four different page shapes and one bundle. What holds them together is your question, not the sites they came from.",
  },
];

/**
 * Why someone installs it, with video first.
 *
 * The beats above answer what the panel does. This answers who is standing
 * there and what they wanted, which is a different question and deserves its
 * own band rather than a fifth beat. Video leads because it is the only case
 * where the thing you came for is not on the page as text at all, and it is
 * the only one that gets the panel beside it.
 */
function Uses() {
  const scene = useYouTubeCycle();

  return (
    <MarketingSection labelledBy="uses">
      <h2
        id="uses"
        className="font-display text-ink max-w-[26ch] text-[clamp(1.35rem,3vw,1.7rem)] font-bold leading-tight tracking-[-0.02em]"
      >
        The thing you came for is not always text.
      </h2>
      <p className="text-ink-secondary mt-4 max-w-[58ch] text-[15px] leading-relaxed">
        Four situations, starting with the one that is hardest to do any other way.
      </p>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-14">
        <div className="min-w-0">
          <h3 className="font-display text-ink text-[clamp(1.1rem,2.2vw,1.25rem)] font-semibold leading-snug tracking-[-0.015em]">
            Watching is the slowest way to read
          </h3>
          <p className="text-ink-secondary mt-4 max-w-[58ch] text-[15px] leading-relaxed">
            A watch page is the one place where what you came for is not text at all. The panel
            takes the video's description and its whole transcript, so a forty-minute talk becomes
            something you can search, quote and ask a question about without watching it first.
          </p>
          <p className="text-ink-secondary mt-4 max-w-[58ch] text-[15px] leading-relaxed">
            A channel's Videos tab is a listing like any other, so every row it has loaded gets a
            tap target of its own. One tab over, the Playlists tab lists playlists rather than
            videos, and taking one row takes everything the playlist holds, filed under its name.
          </p>
          <p className="border-hairline text-ink-muted mt-5 max-w-[54ch] border-l pl-4 text-[14px] leading-relaxed">
            Measured on a 38-video playlist: one row tapped, 38 videos back, each read on its own.
          </p>
          <p className="text-ink-secondary mt-5 max-w-[58ch] text-[15px] leading-relaxed">
            Nothing here needs a refresh. The panel re-reads the page whenever it changes, so those
            three pages are three different offers with no click in between, and scrolling a feed to
            load more rows adds them to the list you are already looking at.
          </p>

          {/* The panel rides with the copy on narrow screens, where nothing can
              sit beside anything. */}
          <ClipperPanel state={scene} className="mt-8 lg:hidden" />

          {USES.map((use) => (
            <div key={use.heading} className="border-hairline mt-8 border-t pt-8">
              <h3 className="font-display text-ink text-[16px] font-semibold leading-snug tracking-[-0.01em]">
                {use.heading}
              </h3>
              <p className="text-ink-secondary mt-2.5 max-w-[58ch] text-[14.5px] leading-relaxed">
                {use.body}
              </p>
            </div>
          ))}
        </div>

        <aside className="hidden lg:block">
          <ClipperPanel state={scene} />
        </aside>
      </div>
    </MarketingSection>
  );
}

function Everywhere() {
  return (
    <MarketingSection tone="alt" labelledBy="everywhere">
      <h2
        id="everywhere"
        className="font-display text-ink max-w-[22ch] text-[clamp(1.35rem,3vw,1.7rem)] font-bold leading-tight tracking-[-0.02em]"
      >
        Everywhere else, it reads the article.
      </h2>
      <p className="text-ink-secondary mt-4 max-w-[60ch] text-[15px] leading-relaxed">
        If a page reads as an article, the panel offers to clip it. Mozilla's Readability picks the
        body and Turndown renders it, which covers Substack, Medium, documentation sites, news and
        blogs with no per-site code. Navigation, sidebars, cookie bars and footers are left behind.
      </p>

      <LabeledPoints
        items={[
          {
            label: "threads",
            body: 'Reddit and Hacker News, whole. Expanding a Reddit thread clicks its own "more replies" three rounds deep, and is off by default because it is slower.',
          },
          {
            label: "listings",
            body: "Subreddits, front pages, channels and search pages, with a tap target on every row.",
          },
          {
            label: "video",
            body: "Descriptions and full transcripts from a watch page, and the videos a playlist holds. Comments are an opt-in extra, off by default, because they cost up to 45% more tokens.",
          },
          {
            label: "articles",
            body: "Any page that reads as one, on any site, with no per-site code behind it.",
          },
        ]}
      />
    </MarketingSection>
  );
}

function Nothing() {
  return (
    <MarketingSection labelledBy="nothing">
      <h2
        id="nothing"
        className="font-display text-ink max-w-[24ch] text-[clamp(1.35rem,3vw,1.7rem)] font-bold leading-tight tracking-[-0.02em]"
      >
        What it does not do.
      </h2>
      <div className="text-ink-secondary mt-5 grid max-w-[70ch] gap-4 text-[15px] leading-relaxed sm:grid-cols-2">
        <p>
          Nothing is read from a page until you ask for it. There is no background crawling, no page
          is touched because you happened to visit it, and no clipping is sent anywhere except the
          fileconcat.com tab you are looking at.
        </p>
        <p>
          There is no account, no sign-in, and no server of ours in the path. Clippings are held in
          your browser's own storage between the clip and the send, and the sent list is a receipt
          rather than a library: rows leave after seven days.
        </p>
      </div>
      <p className="text-ink-muted mt-6 text-[14px]">
        The{" "}
        <Link to="/privacy" className="text-go-fg underline underline-offset-4">
          privacy page
        </Link>{" "}
        covers the extension alongside the site.
      </p>
    </MarketingSection>
  );
}

function Close() {
  return (
    <MarketingSection tone="alt" labelledBy="get-it" className="text-center">
      <h2
        id="get-it"
        className="font-display text-ink mx-auto max-w-[20ch] text-[clamp(1.5rem,3.4vw,2rem)] font-bold leading-tight tracking-[-0.02em]"
      >
        Put it next to what you are reading.
      </h2>
      <p className="text-ink-secondary mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed">
        Free, open source, and it works with the tool you already use. Clippings land in the same
        bundle as the files you drop in yourself.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground rounded-card focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-2 px-5 py-2.5 text-[14.5px] font-semibold transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Add to Chrome
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </a>
        <Link
          to="/"
          className="border-border text-ink-secondary hover:text-ink rounded-card focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center border px-4 py-2.5 text-[14px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Open the bundler
        </Link>
      </div>
    </MarketingSection>
  );
}
