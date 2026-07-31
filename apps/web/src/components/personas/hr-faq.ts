/**
 * FAQ for /for/hr. Rendered on the page and emitted as FAQPage JSON-LD from the
 * route, so it lives in its own module (both import it, and it keeps the component
 * file to component-only exports for fast refresh). Questions stay clean and
 * grammatical; the raw search query is never mirrored.
 */
export const HR_FAQ = [
  {
    q: "Is it safe to use AI on documents with employee personal data?",
    a: "The combining step is fully local: FileConcat reads every file in your browser and uploads nothing, so the documents stay on your computer while you prepare them. What you then paste into an assistant is your own choice.",
  },
  {
    q: "Can I combine a batch of CVs into one file?",
    a: "Yes. Drop the folder of CVs and FileConcat returns a single file, so you can screen the whole batch against a role in one pass instead of pasting each one in turn.",
  },
  {
    q: "Does it read Word handbooks and PDF policies?",
    a: "Yes. Word documents and born-digital PDF files are read as text and combined in order under a file tree, so a whole policy set becomes one reference the assistant can answer from.",
  },
  {
    q: "Does anything get uploaded to a server?",
    a: "No. Everything, including the PDFs, is read in your browser tab. Nothing is uploaded, and there is no account to create.",
  },
];
