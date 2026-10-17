/**
 * FAQ for /how-to/upload-zip-to-chatgpt. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * Vendor statements, read 2026-10-13 and pinned in src/data/vendor-caps.json:
 * OpenAI's uploads article (8555545, supported types and quota),
 * the OpenAI_Support reply of 2026-09-16 on community thread 1381613 (a staff
 * forum reply, never stated as a help-center article), Anthropic's upload
 * article (8241126) and Google's Gemini upload article (14903178). Project
 * reports are forum threads, dated, and are never stated as OpenAI's position.
 *
 * The file counts are ours: the 60 public repositories of the 2026-09-11 repo
 * funnel run (docs/measurements/repo-funnel-2026-09-11-3rdparty.json, the
 * `found` stage, every file a fresh clone holds). A GitHub ZIP holds the same
 * tracked files, less any the repository marks export-ignore.
 */
export const UPLOAD_ZIP_FAQ = [
  {
    q: "Can I upload a ZIP file to ChatGPT?",
    a: "Yes, the upload goes through. Reading it is a separate step: ChatGPT's file-analysis tools have to unpack the archive before it sees any file inside. ZIP is not on OpenAI's list of supported file types. OpenAI's support team wrote on its community forum in September 2026 that the file-analysis tools may not be able to unpack or inspect the archive, even when the upload appears to succeed.",
  },
  {
    q: "Why does ChatGPT say it can't open my ZIP?",
    a: "Because unpacking runs in ChatGPT's file-analysis tools, and when they error the archive stays closed. Forum reports from 2024 to September 2026 describe ZIPs that uploaded fine and then could not be read, including inside Projects and Business workspaces. A plain text file needs no unpacking, so the same contents combined into one file avoid the step that fails.",
  },
  {
    q: "What does OpenAI recommend instead?",
    a: "Its support reply suggests extracting the ZIP on your computer and uploading the individual files. Each of those files counts toward the upload quota: 80 files every 3 hours, and 3 a day on the Free plan, as of September 2026. In our sample of 60 public code repositories, 51 held more than 80 files. Combined into one text file, the whole archive spends one upload.",
  },
  {
    q: "Can Claude read ZIP files?",
    a: "ZIP is not on the list of document types Anthropic says Claude works with (PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB and JSON). Its help pages say nothing about archives. A chat also takes at most 20 files, and 59 of the 60 repositories we measured held more than that. One combined TXT file is on the list and takes one of the 20.",
  },
  {
    q: "Can Gemini read ZIP files?",
    a: "Yes, Google lists ZIP as supported, with limits: a ZIP can contain up to 10 files, can be up to 100 MB and can't include video or audio. Every one of the 60 repositories we measured held more than 10 files, the median 183. For code, Gemini's Import Code takes one folder or GitHub repository of up to 5,000 files instead. For documents, a combined text file carries everything in one.",
  },
  {
    q: "Which archives does FileConcat open?",
    a: "ZIP, TAR, TAR.GZ (or .tgz), GZ, 7Z, RAR, BZ2 and XZ, all unpacked in your browser. The documents inside, PDF, Word, Excel and PowerPoint included, are read as text the same way loose files are. A password-protected or damaged archive won't open; unpack that one on your computer and drop the folder.",
  },
  {
    q: "Are my files uploaded to a server?",
    a: "Not to us. FileConcat unpacks the archive in your browser, and there is no account to create. The only upload is the one combined file you choose to send to ChatGPT.",
  },
];
