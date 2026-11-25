/**
 * FAQ for /how-to/send-many-screenshots-to-chatgpt. Rendered on the page and
 * emitted as FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor figures are pinned in src/data/vendor-caps.json and held on the
 * 2026-11-25 build: Anthropic's vision docs (20 images a message on claude.ai,
 * 8000 x 8000 px, the 28 px patch cost) and upload help (pictures in PDFs of
 * 100 pages or fewer), OpenAI's uploads page (80 files every 3 hours, 3 a day
 * on Free, 20 MB an image) and Google's Gemini help (10 files a prompt). The
 * token and word figures are ours, from src/data/screenshots-measured.json,
 * and the answer counts from src/data/image-formats-measured.json.
 */
export const SCREENSHOTS_FAQ = [
  {
    q: "How many screenshots can I send to Claude?",
    a: "Twenty images per message on claude.ai, each up to 8000 x 8000 pixels, according to Anthropic's documentation in November 2026. As one PDF built here, up to 100 screenshots go in as one file, which Claude reads page by page as pictures.",
  },
  {
    q: "How many screenshots can I upload to ChatGPT?",
    a: "OpenAI's upload quota counts files: up to 80 every 3 hours, and 3 a day on the Free plan. One image can be up to 20 MB. Forty screenshots in one PDF cost one upload. Figures as of November 2026.",
  },
  {
    q: "How many screenshots can I send to Gemini?",
    a: "Ten files in one prompt, according to Google's Gemini help in November 2026. A PDF of screenshots counts as one of the ten.",
  },
  {
    q: "Does the AI still see the screenshots inside a PDF?",
    a: "In our test, yes. We asked 24 questions about 72 screenshots sent as one PDF a set, and Claude, ChatGPT Plus and Gemini each answered all 24, the same as with separate images. Claude reads pages as pictures only in PDFs of 100 pages or fewer, so longer sets come as parts of 100.",
  },
  {
    q: "Is a screenshot's text smaller than the picture?",
    a: "In our test, yes. Nine 1920 x 1080 screenshots of articles, docs and code pages held a median of 631 tokens of text. Anthropic's own formula counts the same picture at 1,560 tokens on its standard models and 2,691 on its high-resolution ones.",
  },
  {
    q: "What does reading a screenshot lose?",
    a: "Everything that is not writing: layout, colors, charts, icons and the shape of an interface. On pages of prose, 97 to 100 percent of the words read back were on the page. On busy interfaces like GitHub, Hacker News and MDN it was 72 to 81 percent. If the picture is the point, send that one as an image.",
  },
  {
    q: "Which languages can it read?",
    a: "It reads in your browser's language when a reader exists for it, and in English otherwise, and you can pick another before it starts. The reader for a language is downloaded once, about 3 MB for English.",
  },
  {
    q: "Are my screenshots uploaded to a server?",
    a: "Not to us. The PDF is built and the text is read in your browser, and there is no account to create. The only upload is the one file you send to ChatGPT, Claude or Gemini.",
  },
];
