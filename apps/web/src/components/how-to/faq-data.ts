/**
 * FAQ for /how-to/share-all-files-with-ai. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module (both import it,
 * and it keeps the component file to component-only exports for fast refresh).
 * Questions stay clean and grammatical; the raw search query is never mirrored.
 */
export const FAQ_ITEMS = [
  {
    q: "How do I share more than 5 files with ChatGPT?",
    a: "Combine them into one file first. Drop the whole folder into FileConcat and it returns a single file, which you can add to a Project or paste into a chat well under the per-project and per-message caps.",
  },
  {
    q: "Can I combine several PDFs or Word documents into one file for Claude or Gemini?",
    a: "Yes. FileConcat reads PDF, Word, Excel, and PowerPoint files in your browser and pulls their text into one file, so you paste that single file in instead of adding each document separately.",
  },
  {
    q: "Do my files get uploaded to a server?",
    a: "No. Everything is read in your browser tab, including PDFs and Office documents. Nothing is sent, nothing is stored, and there is no account to create.",
  },
  {
    q: "Does this work for NotebookLM, Gemini Gems, and Custom GPTs too?",
    a: "Yes. The output is one plain file, so it works anywhere you add sources or knowledge: NotebookLM, a Gemini Gem, a Custom GPT, or a Claude Project.",
  },
];
