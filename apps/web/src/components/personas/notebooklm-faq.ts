/**
 * FAQ for /for/notebooklm. Rendered on the page and emitted as FAQPage JSON-LD
 * from the route, so it lives in its own module (both import it, and it keeps the
 * component file to component-only exports for fast refresh). Questions stay clean
 * and grammatical; the raw search query is never mirrored.
 */
export const NOTEBOOKLM_FAQ = [
  {
    q: "How many sources can I add to a NotebookLM notebook?",
    a: "NotebookLM allows 50 sources on the free plan and 100 with a paid plan. Combining your documents into one file means a whole pile of documents arrives as a single source, so it fits well under the cap.",
  },
  {
    q: "Is there a size limit per source in NotebookLM?",
    a: "Yes. Each source can hold up to about 500,000 words. A combined file stays one source, and FileConcat leaves out boilerplate so the word count goes to the content that matters.",
  },
  {
    q: "Does combining files count as one source?",
    a: "Yes. However many documents go in, FileConcat returns a single file, so it is added to the notebook as one source, with a file tree that keeps every document labeled and in order.",
  },
  {
    q: "Can NotebookLM read the PDFs and Word files I combine?",
    a: "Yes. FileConcat reads PDF, Word, Excel, and PowerPoint files in your browser and turns them into text, so the combined source is plain text NotebookLM can ground its answers and citations on.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "No. Every file, including the PDFs and Office documents, is read in your browser tab. Nothing is sent, nothing is stored, and there is no account to create.",
  },
];
