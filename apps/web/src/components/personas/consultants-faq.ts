/**
 * FAQ for /for/consultants. Rendered on the page and emitted as FAQPage JSON-LD
 * from the route, so it lives in its own module (both import it, and it keeps the
 * component file to component-only exports for fast refresh). Questions stay clean
 * and grammatical; the raw search query is never mirrored.
 */
export const CONSULTANTS_FAQ = [
  {
    q: "Can I combine a whole engagement, including slide decks?",
    a: "Yes. PowerPoint decks, Word reports, Excel models, and PDF references are read as text and combined into one file, so the model reasons across the whole engagement at once.",
  },
  {
    q: "Is client material kept private?",
    a: "The combining runs entirely in your browser and nothing is uploaded to FileConcat, so the engagement files stay on your computer while you prepare them.",
  },
  {
    q: "Will the model see the charts and images in my slides?",
    a: "FileConcat pulls the text from slides, so titles, bullet points, and speaker notes come through. A chart or diagram that exists only as an image is not described, since there is no OCR step yet.",
  },
  {
    q: "Do I need to convert or export anything first?",
    a: "No. Drop PDFs, PowerPoint, Word, and Excel files straight in, and FileConcat turns them into one file for ChatGPT, Claude, or Gemini.",
  },
];
