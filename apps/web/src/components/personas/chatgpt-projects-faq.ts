/**
 * FAQ for /for/chatgpt-projects. Rendered on the page and emitted as FAQPage
 * JSON-LD from the route, so it lives in its own module (both import it, and it
 * keeps the component file to component-only exports for fast refresh).
 * Questions stay clean and grammatical; the raw search query is never mirrored.
 */
export const CHATGPT_PROJECTS_FAQ = [
  {
    q: "How many files can I add to a ChatGPT Project?",
    a: "A ChatGPT Project holds 5 files on Free, 25 on Go and Plus, and 40 on Pro, Edu, Business and Enterprise, and only 10 can be uploaded at once. ChatGPT calls them the project's sources, which is why the limit gets searched for by that word as often as by \"files\". OpenAI adjusts these numbers, so check the current one. Combining your documents into a single file first means the whole set takes just one of those slots.",
  },
  {
    // OpenAI's own answer to this names combining, and says so before it names
    // anything else worth doing. Worth quoting rather than paraphrasing: the
    // page is claiming the half of the question the vendor documents but does
    // not solve.
    q: "What should I do when a Project will not take any more files?",
    a: "OpenAI's own advice is to remove older uploads, combine file data, or split the work across several projects. Removing means losing context and splitting means the chats stop sharing it, so combining is the one that keeps everything in front of the model. Drop the folder here and the whole set comes back as one file that fills a single slot.",
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
    a: "No. Every file, including the PDFs and Office documents, is read in your browser tab. Nothing is uploaded, and there is no account to create.",
  },
];
