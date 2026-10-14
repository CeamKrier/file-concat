/**
 * FAQ for /how-to/upload-folder-to-chatgpt. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor statements are from OpenAI's help center, read on 2026-09-24 and
 * pinned in src/data/vendor-caps.json: the supported-types article
 * (8983675), the Projects article (10169521, Drive folder links), the Library
 * article (20001052) and the File Uploads FAQ (8555545, the upload quota).
 * The Drive-folder behaviour is our own 2026-09-14 test, the same one
 * /for/chatgpt-projects cites. ZIP questions live in upload-zip-faq.ts since
 * 2026-10-13, so this page does not compete for them.
 */
export const UPLOAD_FOLDER_FAQ = [
  {
    q: "Can I upload a folder to ChatGPT?",
    a: "OpenAI's help pages describe no way to upload a folder from your computer; you attach the files inside it instead. The folder routes they describe go through connected apps, such as a Google Drive folder linked as a Project source or picked in Library. For a folder on your own disk, combine it into one file first. FileConcat reads the whole tree in your browser and hands back a single file with every path listed at the top.",
  },
  {
    q: "How do I upload many files to ChatGPT at once?",
    a: "Every file you attach counts toward ChatGPT's upload quota: 80 files every 3 hours, and 3 a day on the Free plan, as of September 2026. A folder of forty files spends forty. Combined into one file, the same folder spends one, and ChatGPT reads it as one labeled set.",
  },
  {
    q: "Does the folder structure survive?",
    a: "Yes. The combined file opens with the folder tree, and every file's content sits under its own path, so ChatGPT can tell contracts/msa.pdf from notes/msa.md.",
  },
  {
    q: "What about a Google Drive folder?",
    a: "If your files already live in Drive, a Drive folder link works as a Project source. In our September 2026 test it went into a full Project without taking a file slot. ChatGPT read it live when answering, not from the Project's own files, and it skipped the archives inside the folder. A folder on your own disk has no such route, which is what this page is for.",
  },
  {
    q: "Are my files uploaded to a server?",
    a: "Not to us. FileConcat opens the folder in your browser, and there is no account to create. The only upload is the one combined file you choose to send to ChatGPT.",
  },
];
