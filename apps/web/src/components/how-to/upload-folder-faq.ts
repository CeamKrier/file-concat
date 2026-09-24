/**
 * FAQ for /how-to/upload-folder-to-chatgpt. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor statements are from OpenAI's help center, read on 2026-09-24 and
 * pinned in src/data/vendor-caps.json: the supported-types article
 * (8983675), the Projects article (10169521, Drive folder links), the Library
 * article (20001052) and the File Uploads FAQ (8555545, the upload quota).
 * The ZIP reports are forum threads, dated, and are never stated as OpenAI's
 * position. The Drive-folder behaviour is our own 2026-09-14 test, the same one
 * /for/chatgpt-projects cites.
 */
export const UPLOAD_FOLDER_FAQ = [
  {
    q: "Can I upload a folder to ChatGPT?",
    a: "OpenAI's help pages describe no way to upload a folder from your computer; you attach the files inside it instead. The folder routes they describe go through connected apps, such as a Google Drive folder linked as a Project source or picked in Library. For a folder on your own disk, combine it into one file first: FileConcat reads the whole tree in your browser and hands back a single file with every path listed at the top.",
  },
  {
    q: "Can ChatGPT read ZIP files?",
    a: "Archives are not on OpenAI's list of supported file types, which names text files, spreadsheets, presentations and documents. Reports of ZIPs that ChatGPT would not open go back to 2024 on OpenAI's community forum, and a thread active in September 2026 reports ZIP contents no longer readable inside Projects. A plain text file needs no unpacking, so drop the ZIP here and upload what comes back.",
  },
  {
    q: "How do I upload many files to ChatGPT at once?",
    a: "Every file you attach counts toward ChatGPT's upload quota: 80 files every 3 hours, and 3 a day on the Free plan, as of September 2026. A folder of forty files spends forty. Combined into one file, the same folder spends one, and ChatGPT reads it as one labeled set.",
  },
  {
    q: "Which archives does FileConcat open?",
    a: "ZIP, TAR, TAR.GZ (or .tgz) and GZ, all unpacked in your browser. The documents inside, PDF, Word, Excel and PowerPoint included, are read as text the same way loose files are. 7z and RAR are not opened yet, so unpack those first and drop the folder.",
  },
  {
    q: "Does the folder structure survive?",
    a: "Yes. The combined file opens with the folder tree, and every file's content sits under its own path, so ChatGPT can tell contracts/msa.pdf from notes/msa.md.",
  },
  {
    q: "What about a Google Drive folder?",
    a: "If your files already live in Drive, a Drive folder link works as a Project source. In our September 2026 test it went into a full Project without taking a file slot, but ChatGPT read it live when answering rather than from the Project's own files, and it skipped the archives inside the folder. A local folder or a ZIP has no such route, which is what this page is for.",
  },
  {
    q: "Are my files uploaded to a server?",
    a: "Not to us. FileConcat opens the folder or the archive in your browser tab, and there is no account to create. The only upload is the one combined file you choose to send to ChatGPT.",
  },
];
