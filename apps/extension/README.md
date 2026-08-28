# FileConcat Clipper

An MV3 browser extension that clips web pages into Markdown and hands the
rendered `.md` files to an open fileconcat.com tab, where they join a bundle
like any dropped file. Articles anywhere, plus YouTube transcripts, Reddit
threads and Hacker News discussions.

## Load it

```
pnpm --filter @fileconcat/extension build
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
pick `apps/extension/.output/chrome-mv3`. That is the development path; the
published build is on the
[Chrome Web Store](https://chromewebstore.google.com/detail/fileconcat-clipper/nhjmkijlimliapgbidajgbkangddnlhn)
and its own page is [fileconcat.com/clipper](https://fileconcat.com/clipper).

For day-to-day work use `pnpm --filter @fileconcat/extension dev` and load
`.output/chrome-mv3-dev` instead: WXT rebuilds and re-injects on save, so an
edit to a content script reaches the page with no rebuild and no card reload.
Under WSL it cannot open the browser for you and says so; load the directory
by hand once and leave it.

**Reload the pages too.** Chrome does not inject content scripts into tabs that
were already open when the extension was installed or reloaded, so a YouTube or
FileConcat tab from before will not answer. The send path reloads the FileConcat
tab for you once before giving up; a stale YouTube tab you have to reload
yourself. To use it in an incognito window, turn on **Allow in incognito** on
the extension's card first.

## Use it

A clipping carries the video's description and its full transcript. **Include
comments** adds the top 20 and is off by default: it costs two more requests per
video and a bigger bundle, measured 2026-08-18 at +45% tokens on a 7-minute
video (2,365 -> 3,421) and +7% on one whose transcript dwarfs them. The choice
sticks between sessions.

Click the toolbar icon to open the side panel. It stays open while you browse
and **Now** re-reports itself on every tab switch, every navigation, and
whenever the page grows — so it never describes the page you came from, and
scrolling a feed to load more updates it without a click.

On YouTube: a watch page offers **Clip this video**; a channel's Videos tab or a
search page lists every video the page has loaded, with checkboxes. A channel's
Playlists tab lists playlists instead, and clipping one clips the videos it
holds, filed under the playlist's name. **Include comments** is off by default —
two more requests and up to 45% more tokens.

On Hacker News: a thread offers **Clip this thread** and
`hn.algolia.com/api/v1/items/<id>` returns the entire comment tree in one
request — no auth, no paging, nothing to opt into. Measured 2026-08-19 on a
638-comment thread: 264,851 characters nested eight levels deep. The front page
lists its 30 stories with checkboxes.

Anywhere else: if the page reads as an article, the panel offers **Clip this
page**. Readability decides what the body is and Turndown renders it, which
covers Substack, Medium, documentation, news and blogs without a site-specific
line of code. Measured 2026-08-19 on four unrelated sites — MDN 4,641 chars,
Wikipedia 28,132, a Substack post 39,509 out of a 201,046-character page, a
Cloudflare blog post 2,858 — with no navigation in any of them.

On Reddit: a thread offers **Clip this post** and takes the post plus the
comments the page has rendered. **Expand more comments** is off by default; it
clicks the thread's own "more replies" three rounds deep, measured
2026-08-19 as 25 comments on load and 38 of 41 after expanding. A subreddit
lists the posts it has loaded, with checkboxes, and clipping from there fetches
each post's page for its full body — but **not its comments**, which Reddit
renders on the client and a fetch never sees. That clipping says so in place of
its comment section rather than reading as a thread with none, and it will
never overwrite a fuller clipping of the same post already in the tray.

Clips land in the tray straight away and settle there. Each row carries its own
state, so one failure says so on its own row and names the reason while its
neighbours carry on; a failed row costs nothing but the space it sits in and
can be removed with the × on the row. **Send to FileConcat** pushes every
finished row into an open fileconcat.com tab, opening one if there is none.

Closing the panel does not stop a batch: the clipping runs in the service
worker, and the panel reads the result whenever you open it again.

A push **extends** the tab's bundle rather than replacing it, de-duplicating by
path, so a repo and the discussion about it can sit in one bundle in either
order and re-sending the same clipping does not double it. The tray keeps the
last 50 clippings, so sending the set again is always safe. **Start over** in
the app is the only thing that clears a bundle.

## How it works

| File | Role |
| --- | --- |
| `entrypoints/youtube.content.ts` | Content script on youtube.com. Two innertube POSTs per video, no HTML parsing beyond the client version. |
| `entrypoints/reddit.content.ts` | Content script on reddit.com. Reads `shreddit-post` / `shreddit-comment` attributes; no API. |
| `entrypoints/hn.content.ts` | Content script on news.ycombinator.com. One Algolia request per thread, whole tree. |
| `entrypoints/article.content.ts` | The catch-all, everywhere else. Readability picks the body, Turndown renders it. |
| `src/announce.ts` | One poll per page, telling the panel when the path or the item count changed. |
| `entrypoints/fileconcat.content.ts` | Content script on fileconcat.com. Relays a batch to the page with `window.postMessage`. |
| `entrypoints/background.ts` | The service worker. Owns the tray, every clip and the send, because the panel can be closed mid-batch. |
| `entrypoints/sidepanel/` | The panel: Now, the tray, and the send action. A view — nothing here has a duration. |
| `src/markdown.ts` | Renders a clipping. The obsidian-clipper frontmatter shape lives here, and so does the only test. |

The build is [WXT](https://wxt.dev). `entrypoints/` is the manifest: match
patterns live on each `defineContentScript`, and `wxt.config.ts` carries only
what cannot be inferred. `browser` comes from `#imports` and is typed by WXT,
which is why there is no `@types/chrome` and no hand-written ambient
declaration.

The web app's half is `apps/web/src/hooks/use-clipper-push.ts`, wired in
`app-flow.tsx`. It receives files, not records — the whole reason the web app
gains no new concepts (ADR-0018) — and asks `ingestBatch` for an append, the
same road the app's own **Add files** button takes.

The panel and the worker share no protocol beyond `chrome.storage.local`: the
worker writes, the panel renders `storage.onChanged`. A panel that was shut for
a whole batch opens onto the finished result with no catch-up message to miss.

The first pass had no service worker, because dismissing a popup *was*
abandoning the batch. A side panel is closed the way a drawer is closed, so the
work had to move somewhere that outlives it.

## Local development

The manifest matches `http://localhost/*` as well as `https://fileconcat.com/*`
so a push lands in `pnpm dev`. Chrome match patterns ignore ports, so
`localhost:5173` is covered.

## Things not to rediscover

- **`youtubei/v1/get_transcript` is gone.** It answers `400 FAILED_PRECONDITION`
  for every request shape, including from inside youtube.com's own origin with
  the page's real `INNERTUBE_CONTEXT`. The live route is `get_panel` with
  `panelId: "PAmodern_transcript_view"`. `/api/timedtext` is a separate dead end
  (it wants a proof-of-origin token).
- **A content script runs in the isolated world**, so `window.ytcfg` is out of
  reach. Everything the innertube calls need is either scraped from an inline
  script (the client version) or built from the video id (the panel params).
  No API key, no `visitorData`, no cookies.
- **Reddit has no route worth using.** `.json` answers 403 from inside
  reddit.com itself, and `/svc/shreddit/more-comments/...` — which did work
  once — now answers 200 with the whole 299KB challenge page and zero
  `<shreddit-comment>` in it. The markup is the API: `shreddit-post` and
  `shreddit-comment` carry author, score, depth and timestamps as attributes,
  and the page's own expand buttons are how you get more.
- **Hacker News blocks the request its own clipping needs.** HN serves
  `default-src 'self'`, and a content script's `fetch` runs under the page's
  CSP, so Algolia is unreachable from there — `TypeError: Failed to fetch`. The
  service worker fetches from the extension's origin under `host_permissions`,
  where no page policy applies; that is what `fc:fetch` is for, and any future
  handler behind a strict CSP can use it.
- **A same-origin link is worth less than it costs.** Its href is a path on the
  site the anchor text already names, and this bundle is billed by the token:
  flattening those to plain text cut 27% off an MDN page, 22% off a Wikipedia
  article and 13% off a blog post. External links stay, because they point
  somewhere the prose does not say. Watch the scheme, not just the origin —
  `javascript:void(0)` parses as a valid URL whose origin is `null`, so an
  origin test alone keeps it and the clipping carries a dead link.
- **`isProbablyReaderable`'s `minContentLength` is per paragraph**, not per
  page. Setting it to 400 to mean "a real article" rejected MDN, Wikipedia and
  Substack alike. The length check belongs on the finished body.
- **Neither of its thresholds is the reason it says no most often.** It scores
  `p`, `pre` and `article` nodes and nothing else, so a page keeping its text in
  a `blockquote`, a `dd` or a `td` scores zero however much of it there is. All
  six most recent arXiv cs.CL abstracts were refused this way, each holding
  1,269 to 1,804 characters, and no threshold reaches a node that was never a
  candidate. `looksLikeArticle` therefore falls back to running `clipArticle`
  and asking whether a clipping came out.
- **A page being "loaded" says nothing about it being full.** A subreddit holds
  3 posts when Chrome reports the tab complete and 27 a moment later. `Now` is
  driven by a poll over the item count, not by load events, which is also what
  makes scrolling for more work.
