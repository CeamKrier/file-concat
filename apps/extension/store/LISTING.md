# Chrome Web Store listing

Everything the submission form asks for, in the order the dashboard asks it.
Copy fields from here rather than rewriting them, because an update is reviewed
exactly like a new item and answers that drift between submissions are the kind
of thing a reviewer stops on.

Assets are in `assets/`. They are generated, not hand-drawn. Rebuild the
extension, then run `node apps/extension/store/generate-assets.mjs` to
reproduce all five from a real browser.

Matches manifest version `0.1.0`.

---

## Store listing

**Item name** (75 max, 18 used)

```
FileConcat Clipper
```

**Summary** (132 max, 121 used)

```
Clip any article, YouTube transcript, Reddit or Hacker News thread to Markdown and send it to your fileconcat.com bundle.
```

The dashboard prefills this from the manifest `description`, which is a shorter
line that names only three of the four sources. Overwrite it with the above.
Changing the manifest to match is optional and needs a rebuild.

**Category**

```
Productivity  >  Tools
```

**Language**

```
English (United States)
```

**Description** (16,000 max)

```
FileConcat Clipper turns the page you are reading into a Markdown file and hands
it to an open fileconcat.com tab, where it joins a bundle you can copy or
download in one piece. It is for anyone who assembles reading material for an
LLM and is tired of pasting pages in one at a time.

WHAT IT CLIPS

Any article. If a page reads as an article, the panel offers to clip it.
Mozilla's Readability picks the body and Turndown renders it, which covers
Substack, Medium, documentation sites, news and blogs with no per-site code.
Navigation, sidebars, cookie bars and footers are left behind.

YouTube. A watch page gives you the video's description and its full transcript.
A channel's Videos tab or a search page lists every video the page has loaded,
with checkboxes, so a playlist's worth of transcripts is one click. Comments are
an opt-in extra, off by default, because they cost up to 45% more tokens.

Reddit. A thread gives you the post and its comments, with authors, scores and
nesting kept. Expanding the thread's own "more replies" is an opt-in extra. A
subreddit lists the posts it has loaded, with checkboxes.

Hacker News. A thread gives you the entire comment tree, however deep, in one
request. The front page lists its stories with checkboxes.

HOW IT WORKS

Open the side panel from the toolbar icon. It stays open while you browse and
re-reads the current tab on every navigation, so it always describes the page in
front of you.

Clip what you want. Each clipping lands in a tray and settles there, one row per
item, so a page that fails says so on its own row and names the reason while the
rest carry on. The tray holds the last 50, and the work runs in the background,
so closing the panel mid-batch does not stop it.

Then press Send. Every finished row goes into your fileconcat.com tab at once,
opening one if there is none. A send adds to the bundle rather than replacing
it, and files with the same name replace each other, so a repository and the
discussion about it can sit in one bundle and re-sending a corrected clipping
fixes it in place.

WHAT IT DOES NOT DO

Nothing is read from a page until you ask for it. There is no background
crawling, no page is touched because you happened to visit it, and no clipping
is sent anywhere except the fileconcat.com tab you are looking at.

There is no account, no sign-in, and no server of ours in the path. Clippings
are held in your browser's own storage between the clip and the send.

OPEN SOURCE

The extension and the site are both at github.com/CeamKrier/file-concat.
```

**Store icon** — `assets/store-icon-128.png` (128x128 PNG)

**Screenshots** — 1280x800 PNG, upload in this order:

| File                              | What it shows                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `assets/screenshot-1-article.png` | A Wikipedia article beside the panel offering "Clip this page", one file in the tray         |
| `assets/screenshot-2-youtube.png` | A YouTube channel beside the panel listing 30 videos with checkboxes and the comments toggle |
| `assets/screenshot-3-bundle.png`  | Five clippings landing in fileconcat.com as one 36,640-token bundle                          |

**Small promo tile** — `assets/promo-tile-440x280.png`. Optional, and only used
in placements the store chooses. Skip the 1400x560 marquee until an editorial
placement asks for one.

**Video** — none.

**URLs**

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Homepage URL | `https://fileconcat.com`                          |
| Support URL  | `https://github.com/CeamKrier/file-concat/issues` |

**Mature content** — No.

---

## Privacy

**Single purpose** (one purpose, stated as one)

```
FileConcat Clipper converts the web page the user is looking at into a Markdown
file and delivers that file to an open fileconcat.com tab.

Every feature serves that one purpose. The article, YouTube, Reddit and Hacker
News handlers are four ways of reading a page into the same Markdown file. The
side panel is where the user picks what to clip. The tray holds those files
between the clip and the delivery. The send button performs the delivery. The
extension has no other function and no other destination.
```

**Permission justifications**, one per permission the form lists:

| Permission         | Justification to paste                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`          | A clipping has to survive between the moment it is made and the moment the user sends it, and the extension's background worker can be shut down by Chrome at any point in between. The tray is therefore kept in `chrome.storage.local` rather than in memory. The same storage holds the user's two on/off preferences and the last status line shown in the panel. Nothing in it leaves the device. |
| `unlimitedStorage` | Clippings are large. A single Hacker News thread measured 264,851 characters and a long article measured 39,509, and the tray holds up to 50 of them, which is well past the 5 MB the default quota allows. Without this permission a normal session of clipping fills the quota and the tray starts failing to save work the user has already done.                                                   |
| `sidePanel`        | The entire user interface is a side panel. There is no popup and no options page. The panel is what lists what the current page offers, shows the tray, and carries the send button. A panel rather than a popup because clipping continues while the user keeps browsing, and a popup is dismissed the moment attention moves.                                                                        |

**Host permission justification** for `<all_urls>`:

```
Two things need it.

First, the extension supports any article on any site. Its article handler is a
catch-all that uses Mozilla's Readability, which is what lets it work on
Substack, Medium, documentation, news and blogs without a line of site-specific
code. The page the user wants to keep can be any page, so the host list is the
web. Nothing is read from a page until the user presses a button in the panel.

Second, the side panel must name the site it is looking at and decide whether
that page can be clipped at all, which means reading the active tab's URL.
Chrome exposes `tab.url` only to an extension holding either the `tabs`
permission or host permission for that tab. We chose host permissions and did
not request `tabs`, because `tabs` would additionally hand us the title and URL
of every tab in every window, which this extension has no use for.

The extension's own background worker makes exactly one kind of outbound
request, to hn.algolia.com for a Hacker News comment tree, and that host is
checked against a hard-coded allowlist in the source before the request is made.
Everything else the extension reads is read in the page the user is on.
```

**Are you using remote code?**

```
No, I am not using remote code.
```

All executable code ships inside the package. There is no `eval`, no injected
`<script>`, and no module fetched at runtime. The three network requests the
extension makes return data, not code: YouTube's own innertube endpoint for a
transcript, a Reddit post's own page for its full body, and hn.algolia.com for a
comment tree.

**Data usage** — tick this one box:

- [x] **Website content** — text and links from pages the user chooses to clip

Leave unticked: personally identifiable information, health information,
financial and payment information, authentication information, personal
communications, location, web history, user activity.

The reasoning, in case a reviewer asks. The extension itself transmits nothing
to any server we run. It hands the clipped files to a fileconcat.com tab in the
same browser. "Website content" is ticked anyway because that destination is our
own site and its analytics can record file names and the on-screen preview, so
the content the user clipped is disclosed rather than argued about. "Web
history" stays unticked because the tray records only the pages the user chose
to clip, and it never leaves the device.

**Certifications** — all three are true, tick all three:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://fileconcat.com/privacy
```

That page does not mention the extension yet. It has to before this field is
answered honestly. See the open item at the bottom of this file.

---

## Distribution

| Field      | Value  |
| ---------- | ------ |
| Visibility | Public |
| Regions    | All    |
| Pricing    | Free   |

Unlisted goes through the same review as public and buys nothing except a
missing search entry, so there is no faster path in choosing it.

---

## What review will look at

Named by Google as things that slow a review down, and how this item stands
against each:

| Factor                          | This item                                               |
| ------------------------------- | ------------------------------------------------------- |
| Broad host permissions          | `<all_urls>`, unavoidable, justified above              |
| Sensitive execution permissions | none requested, `tabs` deliberately avoided             |
| Obfuscated or minified code     | shipped unminified on purpose, `wxt.config.ts` says why |
| New developer, new item         | both true, so expect the slow end                       |

Expect days, allow for weeks. Google has had a surge notice up since April 2026.
Past three weeks with no answer, contact developer support.

Two things worth knowing before the first update:

An update is reviewed exactly like a new item. There is no instant push. A
submitted update changes nothing for any user until it is approved and
published, so a fix cannot be shipped on a schedule you control.

If a bug turns up after submitting, cancel the review. Do not use deferred
publishing for it. Deferred publishing stages an approved build for 30 days and
then drops it back to draft.

---

## Open before submitting

1. **Privacy policy.** `https://fileconcat.com/privacy` is written entirely
   about the web app and never mentions the extension. It needs a section
   covering what the extension reads, that the tray is local, and that clipped
   files reach the site's own analytics the same way dropped files do.

2. **The panel's empty-state line is out of date.** It reads "Nothing to clip
   here. Open an article, a YouTube video or channel, or a Reddit thread" and
   omits Hacker News, which has been a supported source since the second pass.
   It is visible in `screenshot-3-bundle.png`, beside a tray full of
   hacker-news clippings. Fixing the string means re-shooting that one
   screenshot.
