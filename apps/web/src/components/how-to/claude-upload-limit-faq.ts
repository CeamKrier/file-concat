/**
 * FAQ for /how-to/claude-file-upload-limit. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Every figure and quoted string is from the Claude help center, read on
 * 2026-09-24 and pinned in src/data/vendor-caps.json: "Upload files to Claude"
 * (articles/8241126), the context window article (articles/8606394) and
 * "Troubleshoot Claude error messages" (articles/12466728). Claude prints
 * something when a 21st file is attached, but no help page quotes it, so no
 * answer here does either.
 */
export const CLAUDE_UPLOAD_LIMIT_FAQ = [
  {
    q: "How many PDFs can I upload to Claude?",
    a: "Twenty per chat, the same as any other file, according to the Claude help center in October 2026. Each PDF can have up to 1,000 pages, and past 100 pages Claude reads its text only, not its charts or images. A project takes any number of PDFs up to 30 MB each, as long as they fit the context window together. Two hundred PDFs combined into one file take one of the twenty slots.",
  },
  {
    q: "What is the Claude file upload limit?",
    a: "Up to 20 files per chat, each up to 500 MB, according to the Claude help center in September 2026. A PDF can have at most 1,000 pages and an image at most 8000 x 8000 pixels. Files added to a project are capped at 30 MB each with no file count, but together they have to fit Claude's context window.",
  },
  {
    q: "Does a combined file count as one of the 20?",
    a: "Yes. The cap counts files, and FileConcat hands back one file however many documents went into it. A file tree at the top lets Claude tell them apart. Two hundred files combined take one of the twenty slots.",
  },
  {
    q: 'Why does Claude say "Your message will exceed the length limit for this chat"?',
    a: "That is the length limit, not the file count. Claude's help center says it appears when a message is longer than the chat can take, and that a very large first message can still trigger it. A combined file holds the same text as the files in it, so it is just as long. Leave out what Claude does not need, start a new conversation, or pick a model with a larger context window. Paid plans run 200K to 1M tokens, depending on the model.",
  },
  {
    q: "Can I upload a PDF over 1,000 pages to Claude?",
    a: "Not as a PDF. Claude's help center says it refuses one with an \"Uploaded file is too large\" error. It also says that past 100 pages it reads a PDF's text only, not its charts or images. FileConcat pulls the text out in your browser into a text file, which is not counted in pages. It still has to fit the chat's length limit.",
  },
  {
    q: "Which file type should I attach?",
    a: "Set Format to Plain, and the download is a .txt file. Claude's help center lists TXT among the document types it takes, and does not list XML or Markdown, the other two formats FileConcat offers.",
  },
  {
    q: "Is this the same as the Claude Project limit?",
    a: "No. A chat caps how many files you attach: 20. A project has no file count, only a 30 MB cap per file and a total that must fit the context window. For a project, the fix is leaving files out rather than combining them.",
  },
  {
    q: "Are my files uploaded to a server?",
    a: "Not to us. FileConcat reads every file, PDFs and Office documents included, in your browser, and a public GitHub repository is fetched by your browser straight from GitHub. There is no account to create. The only upload is the one file you attach to Claude.",
  },
];
