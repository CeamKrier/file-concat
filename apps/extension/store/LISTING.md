# Chrome Web Store listing

Everything the submission form asks for, in the order the dashboard asks it.
Copy fields from here rather than rewriting them, because an update is reviewed
exactly like a new item and answers that drift between submissions are the kind
of thing a reviewer stops on.

Assets are in `assets/`. They are generated, not hand-drawn. Rebuild the
extension, then run `node apps/extension/store/generate-assets.mjs` to
reproduce all five from a real browser.

Matches manifest version `0.3.1`.

The version lives in `apps/extension/package.json` and WXT copies it into the
manifest. Bump it by hand, once per submission rather than once per change:
Chrome only accepts an upload numbered above the published one, a number that
never reaches the store means nothing to anyone, and a review takes days, so
there is no release cadence to automate against. Update this line in the same
commit. `0.2.0` is what is live; `0.3.0` was the batch built since, ChatGPT, Claude and Gemini
conversations included, and was rejected on 2026-09-15 for its six-brand
summary (see "Rejected once" below); `0.3.1` is the same package with the
summary and description cut to five brands.

## Dashboard edits for 0.3.1

The package is `pnpm -C apps/extension zip`, which builds and writes
`fileconcatextension-0.3.1-chrome.zip` into the build output folder (238 KB).
Against the 0.2.0 listing, this is what changes and where each change is made.
The title and the summary are the manifest's `name` and `description` and
cannot be edited on the dashboard ("After uploading your item, you won't be
able to edit the metadata of your manifest in the developer dashboard",
developer.chrome.com/docs/webstore/prepare), so those two change by the upload
itself. The other three are pasted from the fenced blocks below.

| Field                         | Where                        | What changes                                                              |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Title                         | the package (`wxt.config.ts`) | `FileConcat Clipper: threads, chats and transcripts to Markdown`, 62 of 75 |
| Summary                       | the package (`wxt.config.ts`) | chats first, five brands, 116 of 132                                      |
| Description                   | paste                        | the "ChatGPT, Claude and Gemini conversations, whole" paragraph; Hacker News unnamed, link to the full list; Substack and Medium dropped |
| Single purpose                | paste                        | "seven ways of reading a page", the three conversation handlers named     |
| Host permission justification | paste                        | last paragraph: the same-origin conversation requests on the three sites  |
| Homepage URL                  | dashboard field              | still `https://fileconcat.com`; set it to `https://fileconcat.com/clipper` |

Unchanged on purpose: the remote-code answer (still no), the data-usage boxes
(only "Website content", see Privacy), the certifications, the privacy policy
URL, the icon and the five screenshots. The store takes at most five
screenshots ("up to 5 total"), so a conversation shot replaces one rather
than joining them; the five that are live show the panel before the
2026-08-22 redesign, and reshooting is its own session that does not hold
this upload.

### Rejected once

0.3.0 was rejected on 2026-09-15: "Spam and Placement in the Store",
reference "Yellow Argon", "the item's description contains unnecessary
keywords", quoting the summary back verbatim: "ChatGPT, Claude and Gemini
chats, Reddit and Hacker News threads, YouTube transcripts and articles".
The rule it broke is the one this section had already read from the store's
spam FAQ: "When listing supported websites or brands in the description, do
not list more than five. To provide a longer list of brands or websites,
provide a link that users can refer to or embed the list in one of the
extension's promotional screenshots." Six were named, one per source. The
remedy the FAQ names is the one applied for 0.3.1:

- The summary and the description name five brands (ChatGPT, Claude, Gemini,
  Reddit, YouTube) and no more. Hacker News is the one left unnamed, because
  it is the niche of the six and the third screenshot already shows it, which
  is the embedding the FAQ allows. Its paragraph in the description stays,
  pointing at that screenshot instead of naming the site.
- The description links `fileconcat.com/clipper` as the full list of sites.
- Each brand appears at most twice in the description, `fileconcat.com` four
  times, under the FAQ's "under 5 instances" line.

Do not put the sixth name back. If review objects again, the next cut is the
summary with no brands at all ("Save chats, discussion threads, video
transcripts and any article as Markdown for your LLM"). One other developer
reports approval after the same reference by naming no brand at all
(github.com/lcajigasm/site-ip-badge/pull/1); none reports approval at five,
so five is the FAQ's own line, not a tested one. The
privacy fields (single purpose, host justification, remote-code answer) still
name all six sites, because those are technical statements about which hosts
are read, not listing copy, and the policy is about the listing. Substack
and Medium, which were examples rather than sources, stay gone.

---

## Store listing

**Item name** (75 max, 62 used; the manifest `name`, shown read-only on the
dashboard)

```
FileConcat Clipper: threads, chats and transcripts to Markdown
```

The store weighs the title in search, so it carries the three category words a
searcher types rather than a list of brands; the brands are in the summary.
The same string is what Chrome shows in the install dialog and on
chrome://extensions. The toolbar tooltip stays `FileConcat Clipper`
(`action.default_title`).

**Summary** (132 max, 116 used; the manifest `description`, shown read-only on
the dashboard)

```
Save ChatGPT, Claude and Gemini chats, Reddit threads, YouTube transcripts and any article as Markdown for your LLM.
```

Five brands, the store's cap; the six-brand line it replaces is quoted under
"Rejected once". Leads with the conversations from 0.3.0 on. Until then it led with threads,
because page-to-Markdown is the commodity half and a discussion with its
nesting intact was the one thing nothing else did; a conversation the page
only shows a window of is the same argument with more people searching for
it. Neither order was measured, the store offers no search data.

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
FileConcat Clipper turns what you are reading into Markdown files and hands them
to an open fileconcat.com tab, where they join a bundle you can copy or download
in one piece. It is for anyone who assembles reading material for an LLM and is
tired of pasting pages in one at a time.

Copying a page into Markdown is the easy half. What is actually hard to get out
of a browser is a discussion, and that is what this is built around.

WHAT IT CLIPS

Reddit threads, whole. The post and its comments, with every author, score and
level of nesting kept, so a reply reads as a reply to the thing above it rather
than as one more paragraph. "Expand more comments" clicks the thread's own "more
replies" three rounds deep, and it is off by default because it is slower.

The discussion site in the third screenshot, whole. The entire comment tree in
one request, however deep it runs. Measured on a 638-comment thread: 264,851
characters, nested eight levels down, none of which was on screen when you
pressed the button.

ChatGPT, Claude and Gemini conversations, whole. The page shows a window of the
conversation; the extension reads it the way the site's own client does, one
or two same-origin requests on the page's own session. Files a Claude or
Gemini conversation wrote come along as files.

Listings, one item at a time. A subreddit, a YouTube channel, a front page or a
search page lists what it has loaded, and one button scrolls the
page for the rest so the whole listing is on offer. Tap a row to clip it, or
press Select to take a batch. Each item is opened and read on its own, so a
session of scrolling becomes a set of files rather than one flattened page of
headlines.

YouTube transcripts. A watch page gives you the video's description and its full
transcript, which is not text that was on the page to begin with. A channel's
Playlists tab lists its playlists, and clipping one clips the videos it holds.
Comments are an opt-in extra, off by default: they add the top 60 threads and,
under the ones with the most replies, the replies themselves, which runs three
to four times the tokens.

Any article. Everywhere else, if a page reads as an article, the panel offers to
clip it. Mozilla's Readability picks the body and Turndown renders it, which
covers newsletters, documentation sites, news and blogs with no per-site code.
Navigation, sidebars, cookie bars and footers are left behind.

The full list of sites it reads, and what each one gives you, is at
fileconcat.com/clipper.

HOW IT WORKS

Open the side panel from the toolbar icon. It stays open while you browse and
re-reads the current tab on every navigation, so it always describes the page in
front of you.

Clip what you want. A tapped row says it is being read and each clipping lands
in a cart, one row per item, so a page that fails says so on its own row and
names the reason while the rest carry on. The cart holds the last 50, and the
work runs in the background, so closing the panel mid-batch does not stop it.

Then press Send. Every finished row goes into your fileconcat.com tab at once,
opening one if there is none. A send adds to the bundle rather than replacing
it, and files with the same name replace each other, so a repository and the
discussion about it can sit in one bundle and re-sending a corrected clipping
fixes it in place.

What you have sent stays listed for seven days, grouped by send, so you can read
a file back or send a whole batch again. It is a receipt rather than a library:
the rows drop off on their own, and one button clears them early.

WHAT IT DOES NOT DO

Nothing is read from a page until you ask for it. There is no background
crawling, no page is touched because you happened to visit it, and no clipping
is sent anywhere except the fileconcat.com tab you are looking at.

There is no account, no sign-in of ours, and no server of ours in the path. Clippings
are held in your browser's own storage between the clip and the send.

OPEN SOURCE

The extension and the site are both at github.com/CeamKrier/file-concat.
```

**Store icon** — `assets/store-icon-128.png` (128x128 PNG)

**Screenshots**: 1280x800 PNG, at most five, upload in this order. The order
is the argument rather than a tour of the features: the store shows the first
one largest, so it is a nested thread there and not the article a bookmarklet
would also manage.

| File                                     | What it shows                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `assets/screenshot-1-reddit-thread.png`  | An r/rust thread mid-discussion beside the panel offering "Clip this post" and its expand toggle |
| `assets/screenshot-2-reddit-listing.png` | The subreddit that thread came from, 24 posts with checkboxes, four ticked                       |
| `assets/screenshot-3-hn-thread.png`      | A Hacker News tree beside a tray already holding six clippings                                   |
| `assets/screenshot-4-youtube.png`        | A YouTube channel, 30 videos with checkboxes and the comments toggle                             |
| `assets/screenshot-5-bundle.png`         | All nine clippings landing in fileconcat.com as one bundle with a token count                    |

**These five are out of date and the live listing shows them.** They were taken
against the panel as it stood on 2026-08-21; the redesign landed the next day
(`8ed4a91`) and turned the tray into a cart with tap-to-clip rows, a peek sheet
and a Sent list. So every published screenshot shows a panel nobody can install
any more, including the "tray" wording in row 3 and the checkboxes in rows 2
and 4. Reshooting is a real defect on the live listing, not a nicety.

`generate-assets.mjs` cannot do it as it stands. It drives seven panel ids and
five of them were removed by the redesign; `#clip` and `#send` are the two that
survive. The replacements, read out of `entrypoints/sidepanel/index.html`:

| It drives     | The panel now has                    |
| ------------- | ------------------------------------ |
| `#origin`     | `#host`                              |
| `#page-label` | `#page-title`                        |
| `#page-list`  | `#rows`                              |
| `#tray-list`  | `#cart-list` (inside `#cart`)        |
| `#status`     | `#toast-text` (inside `#toast`)      |

The script also has no idea about the surfaces the redesign added: `#cart-bar`,
`#peek-*`, `#sent-*`, `#echo-row` and `#bulk-bar`. Reshooting is a rewrite of
its panel half, not a find-and-replace.

All five are in `assets/`, taken 2026-08-21 in one session.
`screenshot-5-bundle.png` is the only shot with fileconcat.com in it, so it can
only be taken against production, and it had to wait for the page guard that
used to refuse a file name carrying an ellipsis to deploy. That send is now in
the picture: nine clippings, 47,868 tokens, "9 sent. The tab took them."

**Small promo tile** — `assets/promo-tile-440x280.png`. Optional, and only used
in placements the store chooses. Skip the 1400x560 marquee until an editorial
placement asks for one.

**Video** — none yet. The field takes one YouTube URL. A demo was attempted in
code and rejected: a scripted panel cut reads as a slideshow, and the frames
that were meant to look like a browser read as a gray background. The plan is a
short screen recording made by hand, so this field stays empty until that
exists rather than being filled with something worse.

**URLs**

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Homepage URL | `https://fileconcat.com/clipper`                  |
| Support URL  | `https://github.com/CeamKrier/file-concat/issues` |

Homepage URL was `https://fileconcat.com` at submission, which said nothing
about a clipper: the one link a store visitor is offered went to a page that
could not follow up on the listing. `/clipper` shipped 2026-08-28 to be that
page. **Changing it is a dashboard edit that has not been made yet.**

**Mature content** — No.

---

## Privacy

**Single purpose** (one purpose, stated as one)

```
FileConcat Clipper converts the web page the user is looking at into a Markdown
file and delivers that file to an open fileconcat.com tab.

Every feature serves that one purpose. The article, YouTube, Reddit, Hacker
News, ChatGPT, Claude and Gemini handlers are seven ways of reading a page into the same
Markdown file. The side panel is where the user picks what to clip. The tray
holds those files between the clip and the delivery. The send button performs
the delivery. The extension has no other function and no other destination.
```

**Permission justifications**, one per permission the form lists:

| Permission         | Justification to paste                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`          | A clipping has to survive between the moment it is made and the moment the user sends it, and the extension's background worker can be shut down by Chrome at any point in between. The tray is therefore kept in `chrome.storage.local` rather than in memory. The same storage holds the user's per-site on/off preferences and the last status line shown in the panel. Nothing in it leaves the device. |
| `unlimitedStorage` | Clippings are large. A single Hacker News thread measured 264,851 characters and a long article measured 39,509, and the tray holds up to 50 of them, which is well past the 5 MB the default quota allows. Without this permission a normal session of clipping fills the quota and the tray starts failing to save work the user has already done.                                                   |
| `sidePanel`        | The entire user interface is a side panel. There is no popup and no options page. The panel is what lists what the current page offers, shows the tray, and carries the send button. A panel rather than a popup because clipping continues while the user keeps browsing, and a popup is dismissed the moment attention moves.                                                                        |

**Host permission justification** for `<all_urls>`:

```
Two things require it.

First, the extension can clip articles from any site using Mozilla Readability. That is why it works on newsletters, docs, news sites, and blogs without site-specific code. Since the user may save any page, host access must cover the web. Page content is only read after the user presses the clip button.

Second, the side panel needs the active tab’s URL to show the current site and decide whether the page can be clipped. Chrome exposes tab.url only with either the tabs permission or host permission. We use host permissions instead of tabs because tabs would also expose the title and URL of every open tab, which we do not need.

The background worker only makes outbound requests to hn.algolia.com for Hacker News comments, and that host is hard-coded in an allowlist. All other content is read only from the page the user is actively viewing. On chatgpt.com, claude.ai and gemini.google.com the content script makes same-origin requests for the conversation (one on Claude, one per 100 turns on Gemini, two on a signed-in ChatGPT page, the first for the page's own session token), and nothing is stored or sent elsewhere.
```

**Are you using remote code?**

```
No, I am not using remote code.
```

All executable code ships inside the package. There is no `eval`, no injected
`<script>`, and no module fetched at runtime. The network requests the
extension makes return data, not code: YouTube's own innertube endpoint for a
transcript, a Reddit post's own page for its full body, hn.algolia.com for a
comment tree, and chatgpt.com's, claude.ai's and gemini.google.com's own
conversation endpoints, same-origin from the page, for a conversation.

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
to clip, and it never leaves the device. "Personal communications" stays
unticked at the 0.3.0 submission. The form's own example for that box is
"emails, texts, or chat messages", meaning messages between people; a
ChatGPT, Claude or Gemini clip is the user's own exchange with a product,
shown on a web page, read from that page on the user's request and handled
exactly like any other clipped page. It is website content, and that box is
ticked. Ticking the second box would put "Handles personal communications"
on the listing's privacy tab for a thing the extension does not do. If a
reviewer reads it the other way, tick it and resubmit; nothing in the code
changes.

**Certifications** — all three are true, tick all three:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://fileconcat.com/privacy
```

That page carries its own section on the extension, live since 2026-08-20,
which is what makes this an honest answer. See the closed item at the bottom.

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

## Closed before submitting

1. **Privacy policy.** `https://fileconcat.com/privacy` covered only the web app
   and never mentioned the extension. It now carries its own section, live since
   2026-08-20, which is what makes that URL an honest answer to the form.

2. **The panel's empty-state line named three sources out of four.** Hacker News
   was missing from it. Fixed, and the screenshots were re-shot.
