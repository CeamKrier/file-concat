/**
 * FAQ for /for/notebooklm. Rendered on the page and emitted as FAQPage JSON-LD
 * from the route, so it lives in its own module (both import it, and it keeps the
 * component file to component-only exports for fast refresh). Questions stay clean
 * and grammatical; the raw search query is never mirrored.
 */
export const NOTEBOOKLM_FAQ = [
  {
    q: "How many sources can I add to a NotebookLM notebook?",
    a: "NotebookLM, which Google now calls Gemini Notebook, allows 50 sources per notebook on the free plan, 100 on Google AI Plus, 300 on Pro and 500 to 600 on Ultra. Combining your documents into one file means a whole pile of documents arrives as a single source, so it fits well under the cap.",
  },
  {
    // The one query on this page that arrives mid-problem rather than
    // mid-research: people paste the notebook's own refusal into a search box.
    // Answered as a question about the situation, not as the message itself.
    q: "What can I do when a notebook will not take any more sources?",
    a: "The notebook has reached its source cap, so the fix is to make the next batch arrive as fewer sources rather than to delete what is already there. Combine the documents you were about to add into one file and add that: however many went in, the notebook counts one source. Each document sits under its own name in the file, so a cited passage can be traced back to it.",
  },
  {
    q: "Is there a size limit per source in NotebookLM?",
    a: "Yes. Each source can hold up to 500,000 words, or 200 MB for an uploaded file, as of September 2026. FileConcat counts the combined file in tokens before you add it, and words run fewer than tokens, so a file under 500,000 tokens is under the cap.",
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
    q: "Which file type should I download for NotebookLM?",
    a: "Markdown or Plain, set under Format before you download, which saves a .md or .txt file. Google lists both among the file types a notebook takes, and XML, the default format, is not on that list. Copying the file and adding it as pasted text works too.",
  },
  {
    q: "Can I add a GitHub repository to NotebookLM?",
    a: "Not by its link alone: a website source brings in the text of that one page, and Google says nested pages are not imported, so the code stays out. Paste the repository link on this page instead, and the whole repository comes back as one file you add as a single source.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "Not to us. Every file, including the PDFs and Office documents, is read in your browser tab, and there is no account to create.",
  },
];
