/**
 * FAQ for /how-to/upload-book-to-chatgpt. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor statements were read on 2026-09-24 and are pinned in
 * src/data/vendor-caps.json: OpenAI's supported-types article (8983675) and
 * File Uploads FAQ (8555545), Claude's upload article (8241126), and the
 * Gemini Notebook sources article (16215270). The Pride and Prejudice count is
 * our own run of this build on 2026-09-24, on Project Gutenberg's EPUB without
 * images (gutenberg.org/ebooks/1342), default settings.
 */
export const BOOK_TOKENS = "165,531";

export const UPLOAD_BOOK_FAQ = [
  {
    q: "Can ChatGPT read EPUB files?",
    a: "EPUB is not among the file types OpenAI's help center names, which lists text files, spreadsheets, presentations and documents such as PDF, DOCX and TXT. A plain text file of the book sidesteps the question: FileConcat reads the EPUB in your browser and hands back one text file that ChatGPT reads like any other.",
  },
  {
    q: "How long a book can I upload to ChatGPT?",
    a: `OpenAI caps one file at 512 MB and 2M tokens, as of September 2026. Pride and Prejudice came to ${BOOK_TOKENS} tokens in our test, far under that. The result screen shows your book's count and what share of your model's context window it takes, so you know before you upload.`,
  },
  {
    q: "Can I upload a textbook PDF to Claude?",
    a: "Yes, in a chat, up to 1,000 pages and 500 MB, as of September 2026; Claude refuses a longer PDF. A text file of the same textbook has no page count, so what limits it is the size and the context window instead.",
  },
  {
    q: "Can I add a book to NotebookLM?",
    a: "Yes. NotebookLM takes EPUB files as sources, each up to 500,000 words or 200 MB, as of September 2026. Several books combined into one file count as one source, as long as the file stays under that cap.",
  },
  {
    q: "Can I combine several books or chapters into one file?",
    a: "Yes. Drop them together and they come back as one file, each under its own name, with the token count for the whole set.",
  },
  {
    q: "Am I allowed to upload a book?",
    a: "That depends on the book and on your rights to it, and you are responsible for what you upload. Public-domain books, such as those on Project Gutenberg, and your own writing are the clear cases.",
  },
  {
    q: "Is the book uploaded to a server?",
    a: "Not to us. FileConcat reads the EPUB or PDF in your browser tab, and there is no account to create. The only upload is the one text file you choose to send to the assistant.",
  },
];
