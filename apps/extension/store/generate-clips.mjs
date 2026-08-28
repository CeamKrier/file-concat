// Records the four looping demo clips the /clipper page is built around, into
// `apps/web/public/clipper/`.
//
//   pnpm --filter @fileconcat/extension build
//   node apps/extension/store/generate-clips.mjs          # record, then cut
//   node apps/extension/store/generate-clips.mjs cut      # re-cut the last take
//
// It lives beside `generate-assets.mjs` because it is the same rig, and it
// composites for the same reason. Chrome's side panel is window chrome, and
// Playwright captures pages rather than windows, so each clip is the real page
// and the real panel recorded separately and pasted at their true widths:
// 800 + 400 = 1200. What comes out reads as a window with a panel docked in it.
//
// A WINDOW CAPTURE WAS TRIED AND IS NOT AVAILABLE HERE. `chrome.sidePanel.open`
// does work over CDP with `userGesture: true`, so the real panel can be docked
// on demand — but WSLg composites through Weston to RDP and leaves the X root
// empty, so `ffmpeg -f x11grab -i :0` records a black frame however the browser
// is launched, `--ozone-platform=x11` included. The only browser installed on
// this machine is Windows-side, which WSL's ffmpeg cannot see either. Recording
// a real docked panel needs a Windows-side screen recorder driven by hand.
//
// TWO STAGES ON PURPOSE. `record` drives one browser session end to end and
// writes one webm per page plus the marks it took along the way. `cut` turns
// those into the finished loops. A session costs a Reddit challenge, a Hacker
// News fetch and a YouTube load; a bad crossfade should cost none of them, so
// the raw take is kept and re-cut offline.
//
// The screencast has no cursor in it — it captures page pixels, and the pointer
// is not one. So the pointer is drawn into the panel and every action moves it
// to its target and presses. Without it the loops are a UI operating itself.
//
// THE PANEL TAB IS NEVER BROUGHT TO FRONT, and both halves are live anyway.
// The panel asks `tabs.query({active: true, currentWindow: true})` for the page
// it is describing, which resolves to the panel itself the moment the panel tab
// is the active one — it then reports a chrome-extension:// URL, hides its clip
// button, and the run stalls waiting for a clipping that was never queued. So
// the site tab holds the front throughout, exactly as generate-assets.mjs
// arranges it. Recording does not need the front: a Chromium screencast keeps
// producing frames for a background tab (measured — a counter ticking in a
// hidden tab advanced normally through the whole recording), so the panel films
// itself working while the site tab stays active.
//
// SEAMLESS LOOP. A clip starts on a settled panel and ends on a different
// settled panel, so its ends do not match and a hard cut reads as a jump. Each
// one is closed by crossfading its own tail back into its own head (`FADE`),
// which is what a marketing loop does and costs `FADE` seconds of duration.
//
// ponytail: the panel waiters below (`until`, `peek`, `panelShows`) are a second
// copy of the ones in `generate-assets.mjs`. Two copies is cheaper than
// refactoring a script whose own run costs minutes against live Reddit, HN and
// YouTube. Extract a shared `panel-driver.mjs` the first time a panel change
// breaks one copy and not the other.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../.output/chrome-mv3");
const PROFILE = resolve(HERE, "../.output/store-profile");
/** Gitignored. Holds the raw take so `cut` can run without a browser. */
const RAW = resolve(HERE, "../.output/clips");
/** Tracked. Four loops, each as webm + mp4 + a poster the page shows first. */
const OUT = resolve(HERE, "../../web/public/clipper");

/**
 * The two halves, in CSS pixels. The panel's 400 is its real width. The site's
 * 800 is the widest Playwright records without scaling: leave `recordVideo.size`
 * unset and a page is recorded at its viewport, capped to fit 800x800, so 800
 * is a 1:1 capture and 880 would be a 0.91 downscale of the busier half.
 */
const PANEL = { width: 400, height: 680 };
const SITE = { width: 800, height: 680 };
/** Chrome draws a hairline where the panel meets the page. Without one the two
 *  captures read as a single confusing page. Two pixels, not one, because
 *  yuv420p needs an even width and 800 + 1 + 400 is not. */
const SEAM = { width: 2, color: "0x342f28" };

/**
 * Text that must not reach a marketing asset. These clips are cut from live
 * Reddit, Hacker News and YouTube, so what is on screen is whatever those sites
 * were serving that minute — the first take put "Fucking Japan Excel Jack" in
 * the r/rust feed, in the panel's row list, and in the cart of the send clip,
 * three frames deep before anyone looked.
 *
 * Selection is filtered rather than the take being rejected: there is always
 * another thread and another row, and a run that throws two minutes in has
 * spent a Reddit challenge to tell you nothing.
 */
const FOUL = /\b(fuck\w*|shit\w*|cunts?|bitch\w*|nigg\w+|retard\w*|slut\w*|whore\w*|rape\w*)\b/i;

/** Seconds of crossfade closing each loop, and therefore seconds each finished
 *  clip is shorter than its marks. Below ~0.25 the seam shows; above ~0.6 the
 *  panel reads as dissolving rather than looping. */
const FADE = 0.4;
/** Still beat held before the pointer moves and after the panel settles. The
 *  loop needs somewhere to breathe at both ends or it reads as a stutter. */
const LEAD_MS = 420;
const HOLD_MS = 950;
/**
 * Wall-clock offset between "a page was created" and "frame 0 of its video".
 * Playwright starts the screencast on page creation, but not in the same tick.
 * Left as a knob because it is the one number in here that a Playwright or
 * Chrome version can move: cut, look at the first frame of each clip in
 * `.output/clips/frames/`, and nudge this if every clip starts late (raise it)
 * or early (lower it).
 */
const SYNC_MS = 0;

/** `playwright-core` is a devDependency of `apps/web`, not of this package.
 *  Resolved to its CommonJS main, so the named exports arrive under `default`. */
const playwright = await import(
  pathToFileURL(createRequire(resolve(HERE, "../../web/package.json")).resolve("playwright-core")).href
);
const { chromium } = playwright.default ?? playwright;

/** How Chrome derives an unpacked extension's id: sha256 of its path, first 16
 *  bytes, each nibble mapped onto a-p. Same derivation as generate-assets.mjs. */
const EXTENSION_ID = createHash("sha256")
  .update(DIST)
  .digest("hex")
  .slice(0, 32)
  .replace(/./g, (nibble) => String.fromCharCode(97 + parseInt(nibble, 16)));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Polls rather than sleeps: none of these pages is ready on a timer, and
 *  Reddit answers the first request with a JS challenge. A check that throws
 *  counts as "not yet", because that redirect destroys the execution context
 *  under whichever `evaluate` is mid-flight. */
async function until(what, check, attempts = 40) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(750);
  }
  throw new Error(`gave up waiting for ${what}${last ? `: ${last.message}` : ""}`);
}

const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/**
 * Cuts one loop out of the take and writes webm, mp4 and a poster.
 *
 * One graph, so the two sources are decoded once each: trim both halves to the
 * same wall-clock window (each in its own video's timeline), seam them, then
 * crossfade the result's tail back over its head. `offset` is where that fade
 * starts inside the trimmed stream — its length minus two fades, one for the
 * head that moved to the end and one for the fade itself.
 */
function cutOne({ name, from, to, site, siteFrom }) {
  const span = to - from;
  if (span <= FADE * 2.5) throw new Error(`${name}: ${span.toFixed(2)}s is too short to close a ${FADE}s loop`);
  const at = (start) => `trim=start=${start.toFixed(3)}:end=${(start + span).toFixed(3)},setpts=PTS-STARTPTS,fps=25`;
  const graph = [
    `[1:v]${at(siteFrom)},pad=w=${SITE.width + SEAM.width}:h=${SITE.height}:x=0:y=0:color=${SEAM.color}[left]`,
    `[0:v]${at(from)}[right]`,
    `[left][right]hstack=inputs=2,split=2[a][b]`,
    `[a]trim=start=${FADE},setpts=PTS-STARTPTS[main]`,
    `[b]trim=end=${FADE},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${FADE}:offset=${(span - FADE * 2).toFixed(3)}[v]`,
  ].join(";");

  const encode = (codec, out) =>
    ffmpeg([
      "-i", `${RAW}/panel.webm`,
      "-i", `${RAW}/${site}.webm`,
      "-filter_complex", graph, "-map", "[v]", "-an", ...codec, out,
    ]);
  // VP9 for everything that can take it, h264 so Safari and older iOS can.
  // Both muted: there is no audio track, and `-an` keeps a browser from hanging
  // audio chrome off a decorative loop.
  encode(
    ["-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p"],
    `${OUT}/${name}.webm`,
  );
  encode(
    ["-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    `${OUT}/${name}.mp4`,
  );
  // The poster is frame 0 of the finished loop, so what the page shows before
  // play is exactly what it is about to play.
  ffmpeg(["-i", `${OUT}/${name}.webm`, "-frames:v", "1", "-q:v", "4", `${OUT}/${name}.jpg`]);
  // Both ends, kept out of the way, for checking SYNC_MS and the seam by eye.
  mkdirSync(`${RAW}/frames`, { recursive: true });
  ffmpeg(["-i", `${OUT}/${name}.webm`, "-frames:v", "1", `${RAW}/frames/${name}-first.png`]);
  ffmpeg(["-sseof", "-0.2", "-i", `${OUT}/${name}.webm`, "-frames:v", "1", `${RAW}/frames/${name}-last.png`]);
  console.log(`${name}: ${(span - FADE).toFixed(2)}s`);
}

function cut() {
  mkdirSync(OUT, { recursive: true });
  for (const mark of JSON.parse(readFileSync(`${RAW}/marks.json`, "utf8"))) cutOne(mark);
}

async function record() {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: SITE,
    // Deliberately no `recordVideo.size`: one size would apply to every page,
    // and the two halves are different shapes. Unset means each page is
    // recorded at its own viewport, which is what the seam needs.
    recordVideo: { dir: RAW },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-sandbox"],
  });

  /** Every recorded page, so `cut` can line two timelines up against one wall
   *  clock. Playwright names video files randomly; these get the clip's name. */
  const takes = [];
  async function open(name, viewport) {
    const page = await context.newPage();
    takes.push({ name, page, startedAt: Date.now() });
    await page.setViewportSize(viewport);
    return page;
  }
  const startedAt = () => takes[0].startedAt;
  const offsetOf = (name) => (takes.find((take) => take.name === name).startedAt - startedAt()) / 1000;

  // First page in the context, so its video covers every mark taken below.
  const panel = await open("panel", PANEL);
  await panel.goto(`chrome-extension://${EXTENSION_ID}/sidepanel.html`);

  // A clean panel: no first-run banner, no cart carried in from a past run.
  // The reload is not optional — the panel reads `seen` once at boot and never
  // again, so a banner dismissed by writing storage stays on screen. It also
  // has to happen before the cursor is injected, because a reload takes it.
  await panel.evaluate(() => chrome.storage.local.set({ tray: [], sent: [], status: null, seen: true }));
  await panel.reload();

  const peek = () =>
    panel.evaluate(() => ({
      host: document.getElementById("host").textContent,
      rows: document.getElementById("rows").children.length,
      offers: !document.getElementById("single").hidden,
    }));

  /** Waits for the panel to be describing the tab we just moved to, rather than
   *  the one before it. */
  const panelShows = (host, ready) =>
    until(`the panel to report ${host}`, async () => {
      const state = await peek();
      return state.host === host && ready(state) ? state : null;
    });

  const trayRows = () => panel.evaluate(() => chrome.storage.local.get("tray").then((s) => s.tray ?? []));

  /** Every clipping settles, including a failed one, so the rows are read
   *  rather than assumed. */
  const settled = (expected) =>
    until(
      `${expected} clipping(s) to settle`,
      async () => {
        const rows = await trayRows();
        const done = rows.every((row) => row.state === "done" || row.state === "failed");
        return rows.length >= expected && done ? rows : null;
      },
      160,
    );

  // The pointer, drawn. Parked low, where a hand would rest before reaching up.
  await panel.evaluate(() => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(231,224,210,.20);border:1.5px solid rgba(231,224,210,.8);" +
      "box-shadow:0 2px 12px rgba(0,0,0,.45);pointer-events:none;z-index:2147483647;opacity:0";
    document.body.append(dot);
    window.__dot = dot;
  });

  /**
   * The pointer is stepped from here, one `evaluate` per frame, rather than
   * handed to `element.animate()` inside the page.
   *
   * What this records is a hidden tab — the site tab holds the front — and in
   * one of those the page's own animation clock does not run at wall-clock
   * speed. A 520ms move finished in roughly nothing, so awaiting it returned
   * immediately, the click landed 140ms into a clip whose first visible frame
   * is at 400ms, and every take opened on an already-pressed button under a
   * pointer that never travelled. Node's `sleep` is not throttled, so the
   * motion written here is the motion that gets recorded.
   */
  let at = { x: 200, y: 640 };
  const paint = (x, y, scale = 1) =>
    panel.evaluate(
      ([px, py, s]) => {
        window.__dot.style.opacity = "1";
        window.__dot.style.transform = `translate(${px}px, ${py}px) scale(${s})`;
      },
      [x, y, scale],
    );

  const STEP_MS = 40;
  const moveTo = async (css, ms = 520) => {
    const to = await panel.evaluate((selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, css);
    const steps = Math.max(2, Math.round(ms / STEP_MS));
    const from = at;
    for (let step = 1; step <= steps; step++) {
      const eased = 1 - (1 - step / steps) ** 3;
      await paint(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
      await sleep(STEP_MS);
    }
    at = to;
  };

  /** Presses where the dot already is. The click fires at the bottom of the
   *  pulse, which is when a real one fires too. */
  const press = async (css) => {
    await paint(at.x, at.y, 0.62);
    await sleep(110);
    await panel.evaluate((selector) => document.querySelector(selector).click(), css);
    await sleep(90);
    await paint(at.x, at.y, 1);
  };

  const tap = async (css) => {
    await moveTo(css);
    await press(css);
  };

  const marks = [];
  /** Brackets one clip: a still beat, the action, a still beat. */
  async function clip(name, site, act) {
    await sleep(LEAD_MS);
    const from = (Date.now() - startedAt() + SYNC_MS) / 1000;
    await act();
    await sleep(HOLD_MS);
    marks.push({ name, site, from, to: (Date.now() - startedAt() + SYNC_MS) / 1000, siteFrom: from - offsetOf(site) });
    // Written as they are taken, not at the end: a run costs minutes against
    // live Reddit, HN and YouTube, and a failure in clip 4 should not throw
    // away clips 1 to 3.
    writeFileSync(`${RAW}/marks.json`, JSON.stringify(marks, null, 2));
    console.log(`marked ${name}`);
  }

  try {
    // 1. A whole discussion. Hacker News returns its entire tree in one
    //    request, so the token figure that lands in the cart is the argument:
    //    none of it was on screen when the button was pressed.
    const hn = await open("hn", SITE);
    const busiest = await hn
      .goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" })
      .then(() =>
        hn.evaluate(() =>
          [...document.querySelectorAll("tr.athing")]
            .map((row) => {
              const links = [...(row.nextElementSibling?.querySelectorAll("a[href^='item?id=']") ?? [])];
              return {
                id: row.id,
                title: row.querySelector(".titleline a")?.textContent ?? "",
                comments: parseInt(links[links.length - 1]?.textContent ?? "0", 10) || 0,
              };
            })
            .sort((a, b) => b.comments - a.comments),
        ),
      )
      .then((rows) => rows.find((row) => !FOUL.test(row.title)));
    if (!busiest) throw new Error("no clean thread on the Hacker News front page");
    console.log(`hn: "${busiest.title}" carries ${busiest.comments} comments`);
    await hn.goto(`https://news.ycombinator.com/item?id=${busiest.id}`, { waitUntil: "domcontentloaded" });
    await hn.bringToFront();
    await panelShows("news.ycombinator.com", (state) => state.offers);
    // The comment tree, not the submission line, because the tree is the claim.
    await hn.evaluate(() => document.querySelector("tr.athing.comtr")?.scrollIntoView({ block: "start" }));
    await sleep(700);
    await clip("thread", "hn", async () => {
      await tap("#clip");
      await settled(1);
    });

    // 2. Many at once. A subreddit lists what it has loaded and a tap on a row
    //    clips that row's own page, so three taps are three files rather than
    //    one flattened screen of headlines.
    const reddit = await open("reddit", SITE);
    await reddit.goto("https://www.reddit.com/r/rust/", { waitUntil: "domcontentloaded" });
    await reddit.bringToFront();
    await panelShows("reddit.com", (state) => state.rows >= 8);
    // The feed is framed on a stretch carrying no ad and nothing foul. Every
    // offset is a legitimate view of the page, so this picks between them
    // rather than hiding anything.
    const framed = await until("a clean stretch of the feed", async () => {
      for (let index = 1; index <= 20; index++) {
        await reddit.evaluate((nth) => {
          const post = document.querySelectorAll("shreddit-post")[nth];
          if (post) window.scrollTo({ top: window.scrollY + post.getBoundingClientRect().top - 12 });
        }, index);
        await sleep(900);
        const onScreen = await reddit.evaluate(() =>
          [...document.querySelectorAll("shreddit-post")]
            .filter((post) => {
              const box = post.getBoundingClientRect();
              return box.top < window.innerHeight && box.bottom > 0;
            })
            .map((post) => post.textContent)
            .join(" "),
        );
        const ad = await reddit.evaluate(() =>
          [...document.querySelectorAll("body *")].some((el) => {
            if (el.children.length || el.textContent.trim() !== "Ad") return false;
            const box = el.getBoundingClientRect();
            return box.top < window.innerHeight && box.bottom > 0;
          }),
        );
        if (!ad && !FOUL.test(onScreen)) return index;
      }
      return null;
    }, 3);
    console.log(`reddit: feed framed at post ${framed}`);

    /**
     * The next clean row that is not already in the cart, resolved fresh for
     * every tap.
     *
     * Reading three positions up front and tapping them in order does not
     * survive contact: Reddit keeps loading posts after Chrome calls the tab
     * complete, `Now` re-reports itself whenever the page grows, and the
     * panel rebuilds its list under the taps. `data-in` is the panel's own
     * record of what it holds, so this never taps the same row twice and
     * never takes one back out.
     */
    const nextClean = () =>
      panel.evaluate((foul) => {
        const pattern = new RegExp(foul, "i");
        const rows = [...document.querySelectorAll("#rows li.row")];
        return (
          rows.findIndex(
            (li) => li.dataset.in !== "true" && !pattern.test(li.querySelector(".row-title")?.textContent ?? ""),
          ) + 1
        );
      }, FOUL.source);

    await clip("listing", "reddit", async () => {
      for (let tapped = 0; tapped < 3; tapped++) {
        const nth = await until("a clean row to tap", async () => (await nextClean()) || null, 8);
        await tap(`#rows li.row:nth-child(${nth}) .row-tap`);
        await sleep(360);
      }
      await settled(4);
    });

    // 3. Text that was never on the page. A watch page hands over the video's
    //    transcript, and peek is where that stops being a claim: the Markdown
    //    that came out, read back inside the panel. The video is picked off the
    //    channel rather than named here, because a hard-coded id is a 404
    //    waiting to happen and any watch page carries a transcript.
    const yt = await open("yt", SITE);
    await yt.goto("https://www.youtube.com/@Fireship/videos", { waitUntil: "domcontentloaded" });
    // Any anchor pointing at a watch page. Naming YouTube's own ids
    // (`a#video-title-link`) looked tidier and matched nothing at this
    // viewport, because the grid it belongs to is not the layout an 800px
    // window gets.
    const watch = await until("a clean video on the channel page", async () => {
      const links = await yt.evaluate(() =>
        [...document.querySelectorAll("a[href*='/watch?v=']")].map((a) => ({
          href: a.href,
          title: (a.getAttribute("title") || a.textContent || "").trim(),
        })),
      );
      return links.find((link) => link.title && !FOUL.test(link.title)) ?? null;
    });
    console.log(`youtube: "${watch.title}"`);
    await yt.goto(watch.href, { waitUntil: "domcontentloaded" });
    await yt.bringToFront();
    // YouTube plays an ad over the video it was asked for, and an advertiser's
    // brand inside our own marketing asset is somebody else's logo on our page.
    // Skipped where it is skippable, waited out where it is not.
    await until("the pre-roll to clear", async () => {
      const state = await yt.evaluate(() => {
        const skip = document.querySelector(
          ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button",
        );
        if (skip) {
          skip.click();
          return "skipping";
        }
        return document.querySelector("#movie_player.ad-showing, .ytp-ad-player-overlay") ? "showing" : "clear";
      });
      return state === "clear" ? true : null;
    }, 30);
    // Paused on frame one: a loop whose left half is playing somebody's video
    // is competing with its own right half for attention.
    await yt.evaluate(() => {
      const video = document.querySelector("video");
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });
    await sleep(500);
    await panelShows("youtube.com", (state) => state.offers);
    await clip("transcript", "yt", async () => {
      await tap("#clip");
      await settled(5);
      await sleep(500);
      await tap("#cart-bar");
      await sleep(700);
      await tap("#cart-list li:first-child button.mini");
    });

    // 4. The handoff, which is the only moment anything leaves the browser and
    //    the only one the user starts.
    await panel.evaluate(() => document.getElementById("peek-close").click());
    await sleep(600);
    const app = await open("app", SITE);
    await app.goto("https://fileconcat.com/", { waitUntil: "domcontentloaded" });
    await app.bringToFront();
    await panelShows("fileconcat.com", () => true);
    await panel.evaluate(() => document.getElementById("cart-bar")?.click());
    await sleep(700);
    await clip("send", "app", async () => {
      await tap("#send");
      await until("the send to report", async () =>
        panel.evaluate(() =>
          document.getElementById("toast").hidden ? null : document.getElementById("toast-text").textContent,
        ),
      );
      await sleep(1800);
    });

  } finally {
    const videos = takes.map((take) => ({ name: take.name, video: take.page.video() }));
    await context.close();
    for (const { name, video } of videos) if (video) copyFileSync(await video.path(), `${RAW}/${name}.webm`);
  }
}

const mode = process.argv[2] ?? "all";
if (mode !== "cut") await record();
cut();
