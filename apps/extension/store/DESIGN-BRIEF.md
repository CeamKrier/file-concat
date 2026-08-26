# Claude Design brief: FileConcat Clipper store art

Paste this whole file into Claude Design. Seven artboards: five Chrome Web Store
screenshots and two promo tiles.

## The product, in the terms the art has to carry

FileConcat Clipper is a Chrome side panel that turns what you are reading into
Markdown and hands it to an open fileconcat.com tab, where the files join one
bundle you copy or download.

Copying a page into Markdown is the commodity half and every bookmarklet does
it. What nothing else does is take a **discussion** out of a browser with its
authors, scores and nesting intact. That difference is the only argument the
art has to make. A panel that says "save pages as Markdown" describes a
bookmarklet.

Four sources: Reddit threads and listings, Hacker News threads, YouTube
transcripts and playlists, any article via Readability.

Figures that are measured and safe to print:

- A 638-comment Hacker News thread came out as 264,851 characters, nested 8
  levels deep, none of it on screen when the button was pressed.
- The bundle screenshot holds 9 clippings at 47,868 tokens.
- The tray holds the last 50 clippings.

## The reference, and what is taken from it

The model is the Obsidian Web Clipper listing. What it does that we are copying:

- One claim per screenshot, said in a headline, not a tour of features.
- The UI is a tight crop of one real thing, floating on a plain brand field
  with a soft shadow and rounded corners, not a full browser window.
- Headline position moves between panels: beside the crop, above it, below it.
  Five identical layouts read as a template; a moving headline reads as art
  direction.
- Display type is heavy, tight, sentence case.
- Brand colour appears only inside the product UI, never as the field.
- One headline echoes the feature it names, by carrying the product's own
  visual device into the words.

What we are not taking:

- Its fourth panel is a grid of four identical icon cards. That is a house ban.
- Its outer rounded container with a hairline border puts a frame inside the
  store's own frame and spends 60px of every edge. Our field goes full bleed.
- Its cream field. Ours is dark, decided, and not open. See Field below.

## Hard rule: the UI is photographed, never drawn

Every crop in these artboards is a real screenshot taken by
`apps/extension/store/generate-assets.mjs` against live Reddit, Hacker News,
YouTube and fileconcat.com. The design decides the field, the headline, the
crop rectangle and where the crop sits. It does not redraw the panel, invent
row text, restyle a button or improve a label.

So each artboard needs the crop expressed as a **placeholder rectangle** at an
exact position and size, with a note saying which capture fills it and what
region of that capture. Fill the placeholder with the supplied reference
screenshot while designing. The generator will paste the real capture into the
same rectangle afterwards, which is what keeps the five reproducible instead of
becoming hand-made files that rot the next time the panel changes.

## Hard specs

| Artboard         | Size     | Format                                   |
| ---------------- | -------- | ---------------------------------------- |
| S1 to S5         | 1280x800 | 24-bit PNG or JPEG, **no alpha channel** |
| A1 Small tile    | 440x280  | 24-bit PNG or JPEG, **no alpha channel**  |
| A2 Marquee tile  | 1400x560 | 24-bit PNG or JPEG, **no alpha channel**  |

All full bleed. No transparency, no rounded outer corners, no shadow against
the page. The store crops and frames these itself.

Sizes at display: the store shows S1 largest and the rest as a strip, so S1
carries the argument alone if nobody scrolls. A1 renders at roughly half its
pixel size in a grid of other items, so anything under about 14px in that
artboard is gone. A2 only ever appears in an editorial placement, and is seen
large.

## Brand

Single dark theme, warm near-black. These are the app's own tokens.

| Role                  | Hex       |
| --------------------- | --------- |
| Background            | `#16130f` |
| Top glow              | `#211b13` |
| Card surface          | `#1c1812` |
| Inset surface         | `#120f0a` |
| Lifted edge           | `#4a4133` |
| Foreground text       | `#f1ebe0` |
| Secondary text        | `#b3a994` |
| Muted text            | `#8d8472` |
| Faint text / labels   | `#6f675a` |
| Code text             | `#b8b0a0` |
| Border                | `#2c261d` |
| Border strong         | `#342d22` |
| Green (primary/go)    | `#7acd8e` |
| Green text on dark    | `#9fdcb0` |
| Ink on green fill     | `#11261a` |
| Amber (heads-up)      | `#e3b96a` |

Type, all three on Google Fonts:

- Display: **Space Grotesk** 700, letter-spacing `-0.02em`, line-height 1.05
- Body: **Hanken Grotesk** 400/500, line-height 1.45
- Mono: **JetBrains Mono** 400/500, for figures and file names only

Radius is 8px in the product. Crops sit on 12px. Buttons are filled `#7acd8e`
with `#11261a` text.

The logo is at `apps/web/public/logo.png`: a green rounded square overlapping a
cream rounded square, no wordmark. The wordmark is the product name set in
Space Grotesk 700 beside it.

### Field

Dark, on every artboard. The site and its social card are dark, the product has
one theme, and a warm near-black field separates itself from the store's own
white page without help. Do not propose a light variant.

The reference floats a light UI on cream. Ours is the opposite problem: the
product is already near-black, so a crop dropped on `#16130f` has nothing to
separate it from the field.

The field is therefore `#120f0a`, one step **below** the product, carrying the
same radial glow the site uses:
`radial-gradient(125% 85% at 50% -10%, #1c1710 0%, #120f0a 55%)`.
Crops sit above it at `#16130f` with a `#4a4133` edge and a soft black shadow,
so the separation comes from the product being the lighter thing in frame.

Two of the five crops contain a white web page beside the panel, which lands on
this field with no help at all. That contrast is the composition, not a
problem to soften.

## S1: the hero, 1280x800

The only panel that keeps the page and the side panel in one frame. The nesting
is the argument, and the argument needs the thread visible next to the button
that takes it.

- Headline, left, Space Grotesk 700, around 56px, two lines:
  `Whole threads,` in `#f1ebe0`, then `not just the page` in `#7acd8e`.
- **The echo**: indent the second line by one step, the way a reply sits under
  a comment. This is the one place the headline performs the feature. Keep it
  subtle enough that it reads as typography, not as a bulleted list.
- One supporting line under it, Hanken Grotesk 400, 19px, `#b3a994`:
  `Authors, scores and every level of nesting, kept.`
- Crop, right, bleeding off the right edge: `screenshot-1-reddit-thread.png`,
  the region holding the comment tree and the panel's `Clip this post` button
  together. The panel column must be whole. The Reddit side can be cut.

## S2: listings, 1280x800

- Headline across the top, centred, around 46px:
  `Tick what you want. Each one is opened and read on its own.`
  Set `opened and read on its own` in `#7acd8e`.
- Crop below, centred, bleeding off the bottom edge:
  `screenshot-2-reddit-listing.png`, the region holding the feed rows beside
  the panel's checkbox list with four ticked and `Clip 4 posts` showing.

## S3: Hacker News, 1280x800

The panel that carries the number.

- Crop, upper two thirds, bleeding off the top edge:
  `screenshot-3-hn-thread.png`, the region holding the deepest visible part of
  the comment tree beside the tray.
- Headline below it, centred, around 46px:
  `The whole comment tree, however deep it runs.`
- One mono chip under the headline on `#120f0a` with a `#2c261d` border,
  JetBrains Mono 15px, `#b8b0a0`:
  `638 comments · 8 levels deep · 264,851 characters · one file`

## S4: transcripts, 1280x800

- Headline, right, around 50px, two lines:
  `Transcripts.` in `#f1ebe0`, then `Text that was never on the page.` in
  `#7acd8e` at a smaller size.
- Crop, left, bleeding off the left edge: `screenshot-4-youtube.png`, the
  region holding the video rows beside the panel's checkbox list and the
  comments toggle.

## S5: the payoff, 1280x800

- Crop, centred, bleeding off the bottom edge: `screenshot-5-bundle.png`, the
  region holding the fileconcat.com result with its token count and the panel
  reporting the send.
- Headline above it, centred, around 46px:
  `Nine pages. One bundle. One paste.`
- One supporting line, Hanken Grotesk 400, 18px, `#b3a994`:
  `A send adds to the bundle rather than replacing it.`

## A1: small tile, 440x280

Replaces `assets/promo-tile-440x280.png`, which is text-only and spends its
bottom third on a three-line grey paragraph unreadable at display size.

No crop. At this size a screenshot is texture, not information.

1. Logo mark at 48px with `FileConcat Clipper` beside it, Space Grotesk 700,
   17px, `#f1ebe0`.
2. Headline, Space Grotesk 700, around 32px, two lines, carrying S1's indent
   echo: `Whole threads,` in `#f1ebe0` then `not just the page` in `#7acd8e`.
3. One line, Hanken Grotesk, 15px, `#b3a994`:
   `Reddit, Hacker News, YouTube and any article, as Markdown.`

One object and only one: the panel's green Send button as a filled pill reading
`Send 9 files to FileConcat`, sitting low and clipped by the right edge so it
reads as part of a larger interface rather than a floating badge.

## A2: marquee tile, 1400x560

Split roughly 55/45, type left, crop right.

1. Logo mark at 44px with `FileConcat Clipper` beside it.
2. Headline, Space Grotesk 700, around 68px, same two lines and same echo as S1.
3. Supporting paragraph, Hanken Grotesk 400, 20px, `#b3a994`, two lines max:
   `Reddit and Hacker News discussions, YouTube transcripts and any article,
   clipped to Markdown and sent to one fileconcat.com bundle.`
4. `fileconcat.com` in JetBrains Mono 14px, `#6f675a`, bottom right.
5. Crop, right, bleeding off the right and bottom edges: the side panel column
   from `screenshot-5-bundle.png`, showing tray rows across all four sources
   with the green `Send` button pinned to its floor.

## Do not

- No em dashes anywhere in the copy. The brand does not use them.
- No eyebrow or kicker label above a headline.
- No grid of identical feature cards, and no left-side accent stripes on
  containers. Both are house bans, and the first one is in the reference.
- No redrawn, restyled or invented UI. See the hard rule above.
- No stock imagery, illustrated people, 3D browser mockups at an angle,
  glassmorphism, or floating cursor graphics.
- No other company's logo or brand colour. Name Reddit, Hacker News and YouTube
  as words only.
- No claim the product does not make. It does not summarise, it does not use
  AI, and it has no account or sync. It clips and it sends.
- No arrows drawn between the crop and the headline, and no numbered step
  badges. The order of the five is the sequence.

## Export check

Chrome rejects a screenshot or promo tile carrying an alpha channel. Whatever
comes out of Claude Design has to be flattened onto `#120f0a` before upload.
The existing generated assets are already colour type 2; verify a new one the
same way:

```sh
node -e "const b=require('fs').readFileSync(process.argv[1]);\
console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20),'colorType='+b[25])" file.png
```

`colorType=2` is 24-bit truecolour and passes. `colorType=6` carries alpha and
has to be flattened. `colorType=3` is a palette and is not 24-bit.

---

## What changes in the repo if this ships

1. `generate-assets.mjs` currently pastes two captures side by side at their
   true widths in `compose()` and screenshots the result. The composed panels
   are the same mechanism with more HTML around it: a field, a headline, and
   the capture cropped into a placed rectangle. Crop rectangles go in the
   script as per-shot constants, so the five stay reproducible.
2. `LISTING.md` describes the five screenshots as raw captures and tells the
   reader to skip the 1400x560 marquee until an editorial placement asks for
   one. Both need updating.
3. The five have to be re-captured, which means a live session against Reddit,
   Hacker News, YouTube and production.
