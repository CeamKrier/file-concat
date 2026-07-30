/**
 * FAQ for /for/chatgpt-projects. Rendered on the page and emitted as FAQPage
 * JSON-LD from the route, so it lives in its own module (both import it, and it
 * keeps the component file to component-only exports for fast refresh).
 * Questions stay clean and grammatical; the raw search query is never mirrored.
 */
export const CHATGPT_PROJECTS_FAQ = [
  {
    q: "How many files can I add to a ChatGPT Project?",
    a: "A ChatGPT Project holds 5 files on the free tier, 25 on Plus, and 40 on Pro. OpenAI adjusts these numbers, so check the current one. Combining your documents into a single file first means the whole set takes just one of those slots.",
  },
  {
    q: "Does combining files count as one file in my Project?",
    a: "Yes. FileConcat returns a single file, so however many documents go in, only one file is added to the Project and it uses one slot. The file tree at the top keeps every document labeled and in order.",
  },
  {
    q: "What is the difference between Project files and files I attach in a chat?",
    a: "Project files are shared across every chat in the Project; files you attach to a single message are limited to about 10 at a time and only that chat can see them. One combined file works for both, and it stays available to every future chat in the Project.",
  },
  {
    q: "Can ChatGPT read the PDFs and Word documents inside the combined file?",
    a: "Yes. FileConcat pulls the text out of PDF, Word, Excel, and PowerPoint files in your browser and writes it into the combined file as plain text, so ChatGPT reads the content directly without you converting anything first.",
  },
  {
    q: "Are my documents uploaded to a server?",
    a: "No. Every file, including the PDFs and Office documents, is read in your browser tab. Nothing is sent, nothing is stored, and there is no account to create.",
  },
];
