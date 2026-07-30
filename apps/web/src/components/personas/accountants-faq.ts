/**
 * FAQ for /for/accountants. Rendered on the page and emitted as FAQPage JSON-LD
 * from the route, so it lives in its own module (both import it, and it keeps the
 * component file to component-only exports for fast refresh). Questions stay clean
 * and grammatical; the raw search query is never mirrored.
 */
export const ACCOUNTANTS_FAQ = [
  {
    q: "Is it safe to use AI on confidential client financials?",
    a: "The combining step is fully local: FileConcat reads every file in your browser and sends nothing to a server, so the documents never leave your computer. What you then paste into an assistant is your own choice, but preparing the file leaks nothing.",
  },
  {
    q: "Can it read bank statements and spreadsheets?",
    a: "Yes. Born-digital PDF statements, Excel ledgers, and CSV exports are read as text, so the assistant works from the actual numbers and tables rather than an image of them.",
  },
  {
    q: "Do I need to convert my spreadsheets first?",
    a: "No. Drop XLSX and CSV files straight in, and FileConcat pulls the values into the combined file as text alongside the PDFs and Word documents.",
  },
  {
    q: "Does anything get uploaded to a server?",
    a: "No. Everything, including the PDFs, is read in your browser tab. Nothing is sent, nothing is stored, and there is no account to create.",
  },
];
