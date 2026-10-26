/**
 * FAQ for /how-to/send-many-screenshots-to-chatgpt. Rendered on the page and
 * emitted as FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor figures were read on 2026-10-26 and are pinned in
 * src/data/vendor-caps.json: Anthropic's vision docs (20 images a message on
 * claude.ai, 8000 x 8000 px, the 28 px patch cost) and OpenAI's uploads page
 * (80 files every 3 hours, 3 a day on Free, 20 MB an image). The token and
 * word figures are ours, from src/data/screenshots-measured.json.
 */
export const SCREENSHOTS_FAQ = [
  {
    q: "How many screenshots can I send to Claude?",
    a: "Twenty images per message on claude.ai, each up to 8000 x 8000 pixels, according to Anthropic's documentation in October 2026. Read into text here first, any number of screenshots go in as one file, which is one of the twenty.",
  },
  {
    q: "How many screenshots can I upload to ChatGPT?",
    a: "OpenAI's upload quota counts files: up to 80 every 3 hours, and 3 a day on the Free plan. One image can be up to 20 MB. Forty screenshots read into one file cost one upload. Figures as of October 2026.",
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
    a: "Not to us. The text is read in your browser, and there is no account to create. The only upload is the one file you send to ChatGPT or Claude.",
  },
];
