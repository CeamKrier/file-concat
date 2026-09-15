/**
 * FAQ for /for/chatgpt-projects. Rendered on the page and emitted as FAQPage
 * JSON-LD from the route, so it lives in its own module (both import it, and it
 * keeps the component file to component-only exports for fast refresh).
 * Questions stay clean and grammatical; the raw search query is never mirrored.
 */
export const CHATGPT_PROJECTS_FAQ = [
  {
    q: "How many files can I add to a ChatGPT Project?",
    a: 'A ChatGPT Project holds 5 files on Free, 25 on Go and Plus, and 40 on Pro, Edu, Business and Enterprise. The Plus figure held when we filled a Project on a Plus account in September 2026. ChatGPT calls them the project\'s sources, which is why the limit gets searched for by that word as often as by "files". OpenAI adjusts these numbers, so check the current one. Combining your documents into a single file first means the whole set takes just one of those slots.',
  },
  {
    // The banner and toast a full Project shows, read on a Plus account on
    // 2026-09-14 (docs/measurements/e1-project-source, R2). The banner text is
    // in the question because it is the sentence the searcher types once the
    // cap has hit them. Quoted verbatim; do not paraphrase the strings.
    q: 'What does "File limit reached" mean in a ChatGPT Project?',
    a: 'Every file slot on your plan is used. On a Plus account on 14 September 2026 the Sources tab showed "File limit reached" and "You can add up to 25 files on the plus plan. Upgrade to pro to add 40 files." with an "Upgrade plan" button, and each file past the cap was refused with "Maximum file limit reached: Couldn\'t add" and the file name. The add dialog still opens; each extra file is turned away one at a time. Remove one older upload to free a slot, then add one combined file: the whole folder goes into that slot.',
  },
  {
    // OpenAI's own answer to this names combining, and says so before it names
    // anything else worth doing. Worth quoting rather than paraphrasing: the
    // page is claiming the half of the question the vendor documents but does
    // not solve.
    q: "What should I do when a Project will not take any more files?",
    a: "OpenAI's own advice is to remove older uploads, combine file data, or split the work across several projects. Removing means losing context and splitting means the chats stop sharing it, so combining is the one that keeps everything in front of the model. Drop the folder here and the whole set comes back as one file that fills a single slot. A linked Google Drive folder is the other way out: in our September 2026 test it went into a full Project without taking a slot, but ChatGPT read it live at answer time rather than from the Project's file index, and skipped the archives inside it.",
  },
  {
    q: "Does combining files count as one file in my Project?",
    a: "Yes. FileConcat returns a single file, so however many documents go in, only one file is added to the Project and it uses one slot. The file tree at the top keeps every document labeled and in order.",
  },
  {
    // The ceiling on the remedy, from OpenAI's File Uploads FAQ (checked
    // 2026-09-14): 512 MB per file, and 2M tokens per text or document file.
    // The FAQ states it for chats and GPTs and does not list Projects
    // separately. What a Project actually took is measured (same day, same
    // folder as above, R7): a 4,172,265-token, 16.8 MB single bundle went in,
    // was indexed, and answered questions on its first and last lines.
    q: "How big can the one combined file be?",
    a: "OpenAI's File Uploads FAQ puts a hard ceiling of 512 MB on a single uploaded file, and 2 million tokens on a text or document file. It states this for chats and Custom GPTs and does not list Projects separately. In a Plus Project on 14 September 2026 a single combined file of 4.17 million tokens (16.8 MB) was accepted, indexed, and answered questions about its first and last lines, so the 2 million figure is not the Project ceiling; nothing larger was tried. FileConcat shows the token count of the combined file before you upload it, so you know whether the whole folder fits in one slot or needs to be split in two.",
  },
  {
    q: "What is the difference between Project files and files I attach in a chat?",
    a: "Project files are shared across every chat in the Project; a file you attach inside a single chat is visible only to that chat. One combined file works for both, and it stays available to every future chat in the Project.",
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
