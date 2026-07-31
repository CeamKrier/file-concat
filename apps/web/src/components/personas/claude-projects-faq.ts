/**
 * FAQ for /for/claude-projects. Rendered on the page and emitted as FAQPage
 * JSON-LD from the route, so it lives in its own module (both import it, and it
 * keeps the component file to component-only exports for fast refresh).
 * Questions stay clean and grammatical; the raw search query is never mirrored.
 */
export const CLAUDE_PROJECTS_FAQ = [
  {
    q: "How many files can I add to a Claude Project?",
    a: "Claude does not cap a project by file count. Project knowledge shares Claude's context window, around 200,000 tokens, so what matters is the total size rather than the number of files. Combining everything into one file lets you see the token count up front and know it fits.",
  },
  {
    q: "Why does Claude say my project knowledge is full?",
    a: "A Claude Project fills up by size, not by file count, and it shows how much of its knowledge capacity is used. Combining your documents into one file, with boilerplate left out, keeps the whole set well under the limit.",
  },
  {
    q: "Does FileConcat show how much of the context window my files use?",
    a: "Yes. It counts the tokens as it combines, using the same kind of tokenizer the models use, so you see whether the whole set fits before you add it to the project.",
  },
  {
    q: "Can Claude read the PDFs and Word documents I combine?",
    a: "Yes. FileConcat pulls the text out of PDF, Word, Excel, and PowerPoint files in your browser and writes it into one plain-text file, which Claude reads directly without you converting anything first.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "No. Every file, including the PDFs and Office documents, is read in your browser tab. Nothing is uploaded, and there is no account to create.",
  },
];
