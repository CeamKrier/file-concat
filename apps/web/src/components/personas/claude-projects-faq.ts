/**
 * FAQ for /for/claude-projects. Rendered on the page and emitted as FAQPage
 * JSON-LD from the route, so it lives in its own module (both import it, and it
 * keeps the component file to component-only exports for fast refresh).
 * The second question quotes the error Claude shows, the words its searchers
 * type. Figures are pinned in src/data/vendor-caps.json: the context window
 * (8606394), RAG mode (11473015) and the upload limits (8241126).
 */
export const CLAUDE_PROJECTS_FAQ = [
  {
    q: "How many files can I add to a Claude Project?",
    a: "Claude does not cap a project by file count. Project knowledge shares Claude's context window, 200,000 tokens on most models and up to 1 million on paid plans with the newest ones, and paid plans switch to RAG mode as knowledge approaches that limit, stretching capacity up to 10x. Each file can be up to 30 MB, as of September 2026. So what matters is the total size rather than the number of files.",
  },
  {
    q: 'What does "Project knowledge exceeds maximum" mean in Claude?',
    a: "The files in the project add up to more than it can hold. Claude limits a project by total size, not by how many files it has, so the way out is to leave out what the project does not need. Drop the folder into FileConcat: every file and folder shows its size, a click takes a row out, and the token count updates, so you know the rest fits before you add it back as one file.",
  },
  {
    q: "Does combining files make them fit in a project?",
    a: "Not on its own. A project is limited by the total size of its content, and combining keeps every word, so the same documents weigh about the same as one file. What makes them fit is leaving things out, with the count in view. Combining does solve the chat limit, where the cap is a number of files.",
  },
  {
    q: "How many files can I upload to a Claude chat?",
    a: "Up to 20 files per chat, each up to 500 MB, as of September 2026. A combined file takes one of those 20 slots however many documents it holds, with a file tree at the top so Claude can tell them apart.",
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
    a: "Not to us. Every file, including the PDFs and Office documents, is read in your browser tab, and there is no account to create. The only upload is the one file you choose to add to Claude.",
  },
];
