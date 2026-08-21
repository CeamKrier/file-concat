// Regenerates the store screenshots and the promo tile into `assets/`.
//
//   pnpm --filter @fileconcat/extension build
//   node apps/extension/store/generate-assets.mjs
//
// Chrome's side panel is window chrome, and Playwright captures pages rather
// than windows, so each screenshot is the real page and the real panel captured
// separately and pasted at their true widths: 880 + 400 = 1280. The result is
// indistinguishable from a window capture and does not need a screenshot tool
// that works under WSL.
//
// The panel is a background tab while the site tab is active, which is what
// makes `tabs.query({active: true})` resolve to the site rather than to the
// panel itself. Playwright activates the panel to capture it, so every shot
// compares the panel's state either side of the capture and throws if they
// disagree, because a blanked panel is not a usable shot.
//
// The shots run in one session and the tray carries across them, so the five
// read as one sitting: a thread, the listing it came from, a second site's
// thread, a channel, and the bundle all of it lands in. Order matters more than
// coverage here. The store shows the first shot largest, and what this
// extension does that a page-to-Markdown bookmarklet cannot is nested
// discussion and listing pages whose items it opens one by one.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// `playwright-core` is a devDependency of `apps/web`, not of this package.
// Reaching for it there beats adding a browser driver to an extension that
// only needs one to take five pictures.
// Resolved to its CommonJS main, so the named exports arrive under `default`.
const playwright = await import(
  pathToFileURL(
    createRequire(resolve(dirname(fileURLToPath(import.meta.url)), "../../web/package.json")).resolve(
      "playwright-core",
    ),
  ).href
);
const { chromium } = playwright.default ?? playwright;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "assets");
const DIST = resolve(HERE, "../.output/chrome-mv3");
const PROFILE = resolve(HERE, "../.output/store-profile");
/** Production, because the last shot has the app's own chrome in it and a
 *  screenshot reading `localhost` is not a screenshot of the product. Override
 *  only to rehearse a change that has not shipped yet:
 *  `FC_APP=http://localhost:5173/ node store/generate-assets.mjs`. */
const APP_URL = process.env.FC_APP ?? "https://fileconcat.com/";
/**
 * The Reddit thread the first two shots are built around, named rather than
 * drawn.
 *
 * "Busiest thread on the page" was the first attempt and it is the wrong
 * instrument for a store asset. It found a 524-comment argument about Stack
 * Overflow whose replies carried profanity at every scroll depth, with an
 * inline ad in the middle of the tree and a related-posts rail advertising
 * "Stackoverflow is fucking toxic" beside it. None of that is about this
 * extension, and all of it would have been in the picture a reviewer sees
 * first.
 *
 * Replace it when it 404s, which the run will say loudly. What to look for: a
 * technical subreddit, a hundred comments or more so the tree is real, at
 * least depth 2 in the first 25 rendered, and no profanity anywhere in the
 * page text including Reddit's own sidebar.
 */
const REDDIT_SUB = "https://www.reddit.com/r/rust/";
const REDDIT_THREAD = "https://www.reddit.com/r/rust/comments/1vn95fs/rust_on_the_jvm_now_passes_99_of_official/";

/** How Chrome derives an unpacked extension's id: sha256 of its path, first 16
 *  bytes, each nibble mapped onto a-p. */
const EXTENSION_ID = createHash("sha256")
  .update(DIST)
  .digest("hex")
  .slice(0, 32)
  .replace(/./g, (nibble) => String.fromCharCode(97 + parseInt(nibble, 16)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls rather than sleeps, because none of these pages is ready on a timer.
 *  Reddit in particular answers the first request with a JS challenge and only
 *  renders a post after the round trip, which no fixed wait covers honestly.
 *
 *  A check that throws counts as "not yet". That redirect destroys the
 *  execution context under whichever `evaluate` is mid-flight, which is the
 *  same not-ready-yet the poll exists for. The last error is kept so a genuine
 *  failure still names itself when the attempts run out. */
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

mkdirSync(ASSETS, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 880, height: 800 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-sandbox"],
});

const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 800 });
await panel.goto(`chrome-extension://${EXTENSION_ID}/sidepanel.html`);

const peek = () =>
  panel.evaluate(() => ({
    origin: document.getElementById("origin").textContent,
    label: document.getElementById("page-label").textContent,
    rows: document.getElementById("page-list").children.length,
    clip: document.getElementById("clip").hidden ? null : document.getElementById("clip").textContent,
    tray: document.getElementById("tray-list").children.length,
    status: document.getElementById("status").textContent,
    tone: document.getElementById("status").dataset.tone ?? "",
  }));

/** Waits for the panel to be describing the tab we just moved to, rather than
 *  the one before it. Every shot goes through here. */
const panelShows = (origin, offers) =>
  until(`the panel to report ${origin}`, async () => {
    const state = await peek();
    return state.origin === origin && offers(state) ? state : null;
  });

/**
 * Puts the comment tree in frame.
 *
 * A thread page opens on the post, and on Reddit that is a title, an image, a
 * related-posts rail and an ad before a single reply. What this extension takes
 * off these pages is the discussion, so the discussion is what the shot has to
 * be looking at.
 */
async function scrollTo(page, selector, index = 0) {
  await until(`${selector} #${index} to be on the page`, () =>
    page.evaluate(
      ([css, nth]) => {
        const target = document.querySelectorAll(css)[nth];
        if (!target) return false;
        window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - 12 });
        return true;
      },
      [selector, index],
    ),
  );
  await sleep(1200);
}

/** Whether an advertiser is in the frame right now. Reddit hangs its own ad
 *  slots inside the comment stream, each badged with a bare "Ad". */
const showsAnAd = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("body *")].some((el) => {
      if (el.children.length || el.textContent.trim() !== "Ad") return false;
      const box = el.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    }),
  );

/** Post kinds whose card is mostly picture. Measured on r/rust: a `gif` card is
 *  598px tall and an `image` card 672px against an 800px viewport, so one of
 *  them owns the frame on its own. `link` and `text` cards run 130-290px. */
const MEDIA_POSTS = ["gif", "image", "video", "gallery", "multi_media", "rich_video"];

/** Fraction of the viewport a media post may occupy before it owns the shot. A
 *  card peeking in at the bottom edge is what a feed looks like; half a screen
 *  of somebody's game capture is not. */
const MEDIA_SHARE = 0.3;

/** Whether a media post is taking over the frame right now.
 *
 *  Reads `post-type` off the post element rather than measuring the picture,
 *  because the picture is not reachable: Reddit renders it inside a shadow
 *  root, where `querySelectorAll("img, video")` returns nothing and a geometry
 *  check passes every frame while looking like it works. The attribute sits on
 *  the light-DOM host and says what the card is without guessing.
 *
 *  Any intersection at all was the first rule and it rejected all twenty
 *  offsets on r/rust, which is media-dense enough that no clean stretch of it
 *  exists. What the shot cannot carry is a media post *dominating*, so that is
 *  what this measures. */
const showsAMediaPost = (page) =>
  page.evaluate(
    ([kinds, share]) =>
      [...document.querySelectorAll("shreddit-post[post-type]")].some((post) => {
        if (!kinds.includes(post.getAttribute("post-type"))) return false;
        const box = post.getBoundingClientRect();
        const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
        return visible > window.innerHeight * share;
      }),
    [MEDIA_POSTS, MEDIA_SHARE],
  );

/**
 * Frames the page on a stretch with no ad slot and no media post in it.
 *
 * Every offset is a legitimate view of the page, so this picks between them
 * rather than hiding anything: an advertiser's logo in the middle of a store
 * screenshot is somebody else's brand in our listing, and a full-width GIF is
 * somebody else's content taking the space the argument needed. Reddit injects
 * an ad slot into a comment tree and into a subreddit feed alike, so both go
 * through it.
 */
async function frameWithoutAds(page, selector, from = 4, to = 16) {
  for (let index = from; index <= to; index++) {
    await scrollTo(page, selector, index);
    if (!(await showsAnAd(page)) && !(await showsAMediaPost(page))) return index;
  }
  throw new Error(`every frame from ${from} to ${to} had an ad or a media post in it`);
}

/** Chrome draws a hairline where the panel meets the page. Without one the two
 *  captures read as a single confusing page. */
async function compose(name, site) {
  const before = JSON.stringify(await peek());
  const panelShot = await panel.screenshot();
  await site.bringToFront();
  await sleep(400);
  const siteShot = await site.screenshot();
  const after = JSON.stringify(await peek());
  if (before !== after) throw new Error(`${name}: the panel changed under the capture\n  ${before}\n  ${after}`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(
    `<style>*{margin:0}body{width:1280px;height:800px;display:flex;background:#fff}
     img{display:block;height:800px}.d{width:1px;height:800px;background:#dadce0}</style>
     <img src="data:image/png;base64,${siteShot.toString("base64")}" />
     <div class="d"></div>
     <img src="data:image/png;base64,${panelShot.toString("base64")}" />`,
  );
  await page.screenshot({ path: `${ASSETS}/${name}.png` });
  await page.close();
  console.log(`${name}: ${before}`);
}

const tray = () => panel.evaluate(() => chrome.storage.local.get("tray").then((s) => s.tray ?? []));

/** Clips and waits for every row to stop moving. A failed row settles too, so
 *  the rows are checked rather than assumed. */
async function clipAndSettle(expected) {
  const had = (await tray()).length;
  await panel.evaluate(() => document.getElementById("clip").click());
  // Two minutes, because clipping N posts from a listing is N fetches of their
  // own pages, spaced, and Reddit is slow to answer a challenged session.
  const rows = await until(
    `${expected} clipping(s) to settle`,
    async () => {
      const items = await tray();
      const settled = items.every((row) => row.state === "done" || row.state === "failed");
      if (items.length >= had + expected && settled) return items;
      console.log(`  waiting: ${items.map((row) => row.state).join(",") || "empty"}`);
      return null;
    },
    160,
  );
  const failed = rows.filter((row) => row.state === "failed");
  if (failed.length) throw new Error(`clipping failed: ${failed.map((row) => row.error).join(", ")}`);
  return rows;
}

/**
 * Ticks the first `count` boxes and holds until the Clip button agrees.
 *
 * A single pass is not enough. `Now` re-reports itself whenever the page grows,
 * and both a subreddit and a channel keep growing after Chrome calls the tab
 * complete, so a re-render lands on top of the ticks and `replaceChildren`
 * takes them with it. That is the feature working. The shot just has to wait
 * for the page to stop feeding it.
 */
const tick = (count, expected) =>
  until(
    `${count} boxes to stay ticked`,
    async () => {
      await panel.evaluate((n) => {
        for (const box of [...document.querySelectorAll("#page-list input")].slice(0, n)) {
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, count);
      await sleep(1500);
      const state = await peek();
      return state.clip === expected ? state : null;
    },
    20,
  );

try {
  await panel.evaluate(() => chrome.storage.local.set({ tray: [], status: null }));

  // 1. The hero. A Reddit thread, which is what this does that a
  //    page-to-Markdown bookmarklet cannot: authors, scores and nesting kept.
  //    Reddit answers the first request with a JS challenge and renders posts
  //    only after the round trip, so they are waited for rather than slept on,
  //    and the thread picked is the busiest on the page so the shot carries a
  //    discussion rather than three replies.
  const reddit = await context.newPage();
  await reddit.goto(REDDIT_THREAD, { waitUntil: "domcontentloaded" });
  await reddit.bringToFront();
  await panelShows("reddit.com", (state) => state.clip === "Clip this post");
  await clipAndSettle(1);
  await reddit.bringToFront();
  console.log(`reddit thread: framed at comment ${await frameWithoutAds(reddit, "shreddit-comment")}`);
  await compose("screenshot-1-reddit-thread", reddit);

  // 2. The listing. Ticking posts here clips each one's own page, which is the
  //    other half of the story and the reason the panel has checkboxes at all.
  await reddit.goto(REDDIT_SUB, { waitUntil: "domcontentloaded" });
  await reddit.bringToFront();
  await panelShows("reddit.com", (state) => state.rows >= 10);
  // Framed before ticking, not after: scrolling a feed loads more posts, `Now`
  // re-reports itself when it grows and the re-render takes the ticks with it.
  console.log(`reddit feed: framed at post ${await frameWithoutAds(reddit, "shreddit-post", 1, 20)}`);
  await tick(4, "Clip 4 posts");
  await reddit.bringToFront();
  await sleep(1000);
  await compose("screenshot-2-reddit-listing", reddit);
  await clipAndSettle(4);

  // 3. A second site, so "nested discussion" does not read as "a Reddit
  //    extension". Hacker News returns the whole tree in one request, however
  //    deep, which no amount of scrolling the page would have given.
  const hn = await context.newPage();
  await hn.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" });
  const topStory = await hn.evaluate(() => {
    const rows = [...document.querySelectorAll("tr.athing")];
    const counts = rows.map((row) => {
      const links = [...(row.nextElementSibling?.querySelectorAll("a[href^='item?id=']") ?? [])];
      const last = links[links.length - 1];
      return { id: row.id, comments: parseInt(last?.textContent ?? "0", 10) || 0 };
    });
    return counts.sort((a, b) => b.comments - a.comments)[0];
  });
  console.log(`hn: busiest thread carries ${topStory.comments} comments`);
  await hn.goto(`https://news.ycombinator.com/item?id=${topStory.id}`, { waitUntil: "domcontentloaded" });
  await hn.bringToFront();
  await panelShows("news.ycombinator.com", (state) => state.clip === "Clip this thread");
  await clipAndSettle(1);
  await hn.bringToFront();
  await scrollTo(hn, "tr.athing.comtr");
  await compose("screenshot-3-hn-thread", hn);

  // 4. Transcripts, a different kind of value again: a video's words are not on
  //    the page at all until this asks for them.
  const yt = await context.newPage();
  await yt.goto("https://www.youtube.com/@Fireship/videos", { waitUntil: "domcontentloaded" });
  await yt.bringToFront();
  await panelShows("youtube.com", (state) => state.rows >= 10);
  await tick(3, "Clip 3 videos");
  await yt.bringToFront();
  await sleep(1000);
  await compose("screenshot-4-youtube", yt);
  await clipAndSettle(3);

  // 5. The payoff. Everything above, in one bundle, with a token count on it.
  const app = await context.newPage();
  await app.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await app.bringToFront();
  await panelShows(new URL(APP_URL).hostname.replace(/^www\./, ""), (state) => state.tray > 0);
  await panel.evaluate(() => document.getElementById("send").click());
  // The worker reports by writing storage, and it reports failure the same way
  // it reports success, so this waits for either and then reads which.
  const sent = await until("the send to report", async () => {
    const state = await peek();
    return state.tone === "done" || state.tone === "error" ? state : null;
  });
  if (sent.tone !== "done") throw new Error(`the send failed: ${sent.status}`);
  console.log(`send: ${sent.status}`);
  await app.bringToFront();
  await sleep(2500);
  await compose("screenshot-5-bundle", app);

  // 6. The promo tile, rendered in the browser so it uses the site's own fonts.
  const logo = readFileSync(resolve(HERE, "../../web/public/logo.png")).toString("base64");
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Hanken+Grotesk:wght@400&display=swap" rel="stylesheet" />
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:440px;height:280px}
      body{background:#16130f;display:flex;flex-direction:column;justify-content:center;
           padding:0 34px;gap:14px;font-family:"Hanken Grotesk",system-ui,sans-serif;
           -webkit-font-smoothing:antialiased}
      img{width:56px;height:56px;border-radius:13px}
      h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:30px;color:#e7e0d2;
         letter-spacing:-.02em;line-height:1.05}
      h1 em{font-style:normal;color:#7acd8e}
      p{font-size:14.5px;line-height:1.45;color:#9c968c;max-width:350px}
    </style>
    <img src="data:image/png;base64,${logo}" alt="" />
    <h1>Whole threads,<br /><em>not just the page</em></h1>
    <p>Reddit and Hacker News discussions, YouTube transcripts and any article, as Markdown in one bundle.</p>`);
  await tile.evaluate(() => document.fonts.ready);
  await sleep(1200);
  await tile.screenshot({ path: `${ASSETS}/promo-tile-440x280.png` });
  console.log("promo-tile-440x280");
} finally {
  await context.close();
}

// The store's 128x128 upload is the same image the package ships.
writeFileSync(`${ASSETS}/store-icon-128.png`, readFileSync(resolve(HERE, "../public/icon/128.png")));
console.log("store-icon-128");
