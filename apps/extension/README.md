# FileConcat Clipper

An MV3 browser extension that clips web pages into Markdown and hands the
rendered `.md` files to an open fileconcat.com tab, where they join a bundle
like any dropped file. YouTube transcripts today; Reddit and X later.

## Load it

```
pnpm --filter @fileconcat/extension build
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
pick `apps/extension/.output/chrome-mv3`. Unpacked and author-only for now;
there is no store listing.

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

Open a YouTube watch page and the popup offers **Clip this video**. On a
channel's Videos tab or a search page it lists every video the page has already
loaded — scroll first to load more — with checkboxes. Clippings collect in a
tray that survives closing the popup, and **Send to FileConcat** pushes the
selected ones into an open fileconcat.com tab, opening one if there is none.

A push is one drop, so it replaces whatever the tab held before. That is
survivable because the tray keeps the last 50 clippings: send the set again.

## How it works

| File | Role |
| --- | --- |
| `entrypoints/youtube.content.ts` | Content script on youtube.com. Two innertube POSTs per video, no HTML parsing beyond the client version. |
| `entrypoints/fileconcat.content.ts` | Content script on fileconcat.com. Relays a batch to the page with `window.postMessage`. |
| `entrypoints/popup/` | The tray, the page listing, and the send action. |
| `src/markdown.ts` | Renders a clipping. The obsidian-clipper frontmatter shape lives here, and so does the only test. |

The build is [WXT](https://wxt.dev). `entrypoints/` is the manifest: match
patterns live on each `defineContentScript`, and `wxt.config.ts` carries only
what cannot be inferred. `browser` comes from `#imports` and is typed by WXT,
which is why there is no `@types/chrome` and no hand-written ambient
declaration.

The web app's half is `apps/web/src/hooks/use-clipper-push.ts`, wired in
`app-flow.tsx`. It receives files, not records — the whole reason the web app
gains no new concepts (ADR-0018).

There is no service worker. Nothing needs to outlive the popup, and the tray
lives in `chrome.storage.local`.

## Local development

The manifest matches `http://localhost/*` as well as `https://fileconcat.com/*`
so a push lands in `pnpm dev`. Chrome match patterns ignore ports, so
`localhost:5173` is covered.

## Two things not to rediscover

- **`youtubei/v1/get_transcript` is gone.** It answers `400 FAILED_PRECONDITION`
  for every request shape, including from inside youtube.com's own origin with
  the page's real `INNERTUBE_CONTEXT`. The live route is `get_panel` with
  `panelId: "PAmodern_transcript_view"`. `/api/timedtext` is a separate dead end
  (it wants a proof-of-origin token).
- **A content script runs in the isolated world**, so `window.ytcfg` is out of
  reach. Everything the innertube calls need is either scraped from an inline
  script (the client version) or built from the video id (the panel params).
  No API key, no `visitorData`, no cookies.
