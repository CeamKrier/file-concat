/**
 * FAQ for /for/gemini-gems. Rendered on the page and emitted as FAQPage JSON-LD
 * from the route, so it lives in its own module (both import it, and it keeps the
 * component file to component-only exports for fast refresh). Questions stay clean
 * and grammatical; the raw search query is never mirrored.
 */
export const GEMINI_GEMS_FAQ = [
  {
    q: "How many files can I add to a Gemini Gem?",
    a: "A Gem holds about 10 knowledge files. Combining your reference documents into one file means the whole set takes a single knowledge slot, so you are no longer picking which ten to keep.",
  },
  {
    q: "Does combining files count as one knowledge file?",
    a: "Yes. FileConcat returns a single file, so a folder of documents becomes one knowledge file the Gem can draw on, with a file tree that keeps every document labeled and in order.",
  },
  {
    q: "What about the file limit in the Gemini app itself?",
    a: "When you attach files to a single Gemini prompt you are also capped at around 10 files. One combined file works there too, so a large set goes in as a single attachment.",
  },
  {
    q: "Can a Gem read the PDFs and Word documents inside the combined file?",
    a: "Yes. FileConcat pulls the text out of PDF, Word, Excel, and PowerPoint files in your browser and writes it into one plain-text file the Gem reads directly, without you converting anything first.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "No. Every file, including the PDFs and Office documents, is read in your browser tab. Nothing is uploaded, and there is no account to create.",
  },
];
