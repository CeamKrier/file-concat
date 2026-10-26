import { READ_FORMATS, type ReadFormat } from "~/data/formats";
import samples from "~/data/convert-samples.json";

/**
 * The /convert/<format>-to-text pages, one template, the strings that
 * differ written here once. What each format keeps and loses is not written
 * here: it is read from `READ_FORMATS`, so /docs/formats and these pages can
 * never disagree. The sample figure is an engine run, from
 * `src/data/convert-samples.json` (scripts/capture-convert-samples.mjs).
 *
 * The FAQ is rendered on the page and emitted as FAQPage JSON-LD by the route.
 */

export type ConvertKey = keyof typeof samples.samples;

export type FaqItem = { q: string; a: string };

export interface ConvertFormat {
  key: ConvertKey;
  slug: string;
  /** The row label other pages link to this one with. */
  label: string;
  /** That row's short line. */
  blurb: string;
  meta: { title: string; description: string; keywords: string };
  h1: string;
  para: string;
  trust: [string, string];
  dropTitle: string;
  dropHint: string;
  sampleHeading: string;
  sampleSummary: string;
  /** What the source line calls the sample: "Sample PDF, read by ...". */
  sampleNoun: string;
  /** `READ_FORMATS` entries by name: their gives and loses are band 3. */
  formats: string[];
  manyHeading: string;
  manyPara: string;
  listing: string;
  moreHeading: string;
  closeHeading: string;
  /** One more page for the closing list. The long blog guides on the same
   * format were merged into these pages on 2026-10-14 and 301 here. */
  more?: { to: string; label: string };
  faq: FaqItem[];
}

const READY = "ready to paste into ChatGPT, Claude or Gemini.";
const NOT_UPLOADED = "Your files are not uploaded to us.";

const many = (plural: string) =>
  `Drop a folder of ${plural} and they come back as one text file, each under its own name, with a token count for the whole set. An assistant that caps attachments counts it as one.`;

const uploaded = (noun: string): FaqItem => ({
  q: `Is my ${noun} uploaded to a server?`,
  a: `Not to us. FileConcat reads the ${noun} in your browser and there is no account to create. The only upload is the one you choose to make, when you paste or attach the text at your assistant.`,
});

const charts: FaqItem = {
  q: "What happens to charts and pictures?",
  a: "They are not described. A chart is a picture, so a number that exists only in a chart is not in the text. Check the chart's figures against the source before you rely on them.",
};

const plain: FaqItem = {
  q: "Can I get plain text without tags?",
  a: "Yes. Set Format to Plain before you copy or download. The tags go, and each file sits between two rules with its name, under a short summary and the file list.",
};

const atOnce = (noun: string, plural: string): FaqItem => ({
  q: `Can I convert many ${plural} at once?`,
  a: `Yes. Drop several files or a whole folder. They come back as one text file with each ${noun} under its own name, so an assistant that limits attachments takes them as one.`,
});

export const CONVERT_FORMATS: ConvertFormat[] = [
  {
    key: "pdf",
    slug: "pdf-to-text",
    label: "PDF to text",
    blurb: "Page by page, scans included.",
    meta: {
      title: "Convert PDF to text in your browser",
      description: `Drop a PDF and get its text back page by page, scanned pages included, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "pdf to text, convert pdf to text, pdf to txt, extract text from pdf, scanned pdf to text, pdf to text for chatgpt, can chatgpt read scanned pdfs, can claude read scanned pdfs, chatgpt scanned pdf",
    },
    h1: "Convert a PDF to text in your browser.",
    para: `Drop a PDF and get its text back page by page, ${READY}`,
    trust: ["Text layer read, scanned pages recognised", "Forty PDFs in, one text file out"],
    dropTitle: "Drop your PDF here",
    dropHint: "Page by page.",
    sampleHeading: "What a PDF looks like once FileConcat has read it",
    sampleSummary: "A two-page sample PDF. Each page comes back under its own heading.",
    sampleNoun: "PDF",
    formats: ["PDF", "Scanned PDF pages"],
    manyHeading: "Forty PDFs, one file to paste",
    manyPara: many("PDFs"),
    listing: "contracts/\n  lease-2024.pdf\n  lease-2025.pdf\n  renewal-letter.pdf\n  terms.pdf",
    moreHeading: "It reads more than PDFs",
    closeHeading: "Drop your PDF and copy the text",
    more: { to: "/docs/context-window-costs", label: "What it costs to fill a context window" },
    faq: [
      uploaded("PDF"),
      {
        q: "Does it read scanned PDFs?",
        a: "Yes. Pages with no text of their own are read by text recognition in your browser and marked as recognised in the bundle, in a fully scanned PDF and in one where only some pages are scans. Up to three such documents and 8 MB per drop are read in full on their own. Past that, the first three pages of each scan are read, six pages in all, and Read the rest reads the others when you ask. The first time, your browser downloads the recognition engine and one language file from a public CDN; your PDF is not part of that request.",
      },
      {
        q: "Can ChatGPT read a scanned PDF?",
        a: "In a chat, often yes: OpenAI says ChatGPT reads text and images in a PDF you attach directly. It also says files saved to a Project or a GPT's knowledge are handled differently, and that embedded images may not be included. A scan is nothing but images, so turning it into text first is the safe way to keep every page, as of October 2026.",
      },
      {
        q: "Can Claude read a scanned PDF?",
        a: "Up to 100 pages, yes: Claude looks at the pages as well as their text. From 101 to 1,000 pages it reads text only, and a scan has no text, so a long scanned PDF gives Claude nothing to read. Read it here first and the text goes in instead, as of October 2026.",
      },
      charts,
      plain,
      atOnce("PDF", "PDFs"),
    ],
  },
  {
    key: "docx",
    slug: "docx-to-text",
    label: "Word to text",
    blurb: "Headings, tables and footnotes kept.",
    meta: {
      title: "Convert Word (DOCX) to text in your browser",
      description: `Drop a .docx or .doc and get its text with headings, tables and footnotes, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "docx to text, word to text, convert docx to txt, doc to text, word document to text, docx to text for chatgpt",
    },
    h1: "Convert a Word document to text in your browser.",
    para: `Drop a .docx and get its text back with headings, tables and footnotes, ${READY}`,
    trust: [".docx and .doc read here", "Forty documents in, one text file out"],
    dropTitle: "Drop your Word file here",
    dropHint: "Read in your browser.",
    sampleHeading: "What a Word document looks like once FileConcat has read it",
    sampleSummary: "A one-page sample letter. The heading, the table and the footnote come back as text; the picture does not.",
    sampleNoun: "Word document",
    formats: ["Word"],
    manyHeading: "Forty documents, one file to paste",
    manyPara: many("Word documents"),
    listing: "contracts/\n  lease-2024.docx\n  lease-2025.docx\n  renewal-letter.docx\n  terms.doc",
    moreHeading: "It reads more than Word files",
    closeHeading: "Drop your Word file and copy the text",
    more: { to: "/docs/context-window-costs", label: "What it costs to fill a context window" },
    faq: [
      uploaded("Word document"),
      {
        q: "Does it read old .doc files?",
        a: "Yes. The older .doc is read as well as .docx and .docm. OpenDocument .odt and RTF files are read too, as their text.",
      },
      {
        q: "What happens to tracked changes?",
        a: "Tracked deletions are left out, so wording that was struck with track changes on does not read as current text. Accept or reject the changes first if you want the model to see a specific version.",
      },
      charts,
      plain,
      atOnce("document", "Word documents"),
    ],
  },
  {
    key: "excel",
    slug: "excel-to-text",
    label: "Excel to text",
    blurb: "Every sheet under its name.",
    meta: {
      title: "Convert Excel to text in your browser",
      description: `Drop an .xlsx or .xls and get every sheet back as text, each cell as Excel shows it, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "excel to text, xlsx to text, convert excel to txt, spreadsheet to text, xls to text, excel to text for chatgpt",
    },
    h1: "Convert an Excel file to text in your browser.",
    para: `Drop a spreadsheet and get every sheet back as text, each cell as Excel shows it, ${READY}`,
    trust: [".xlsx, .xls and .xlsb read here", "Forty workbooks in, one text file out"],
    dropTitle: "Drop your spreadsheet here",
    dropHint: "Every sheet read in your browser.",
    sampleHeading: "What a spreadsheet looks like once FileConcat has read it",
    sampleSummary: "A two-sheet sample workbook. Each sheet comes back under its name, each cell as Excel shows it.",
    sampleNoun: "spreadsheet",
    formats: ["Excel"],
    manyHeading: "Forty workbooks, one file to paste",
    manyPara: many("workbooks"),
    listing: "finance/\n  budget-2025.xlsx\n  budget-2026.xlsx\n  forecast.xlsx\n  headcount.xls",
    moreHeading: "It reads more than spreadsheets",
    closeHeading: "Drop your spreadsheet and copy the text",
    more: { to: "/docs/context-window-costs", label: "What it costs to fill a context window" },
    faq: [
      uploaded("spreadsheet"),
      {
        q: "Does it read .xls and other spreadsheets?",
        a: "Yes. .xlsx, .xlsm, .xlsb and the older .xls are read, and so are OpenDocument .ods files. A CSV is already text and goes in as it is.",
      },
      {
        q: "Do formulas come through?",
        a: "Their results do, as Excel shows them: the sample's total reads 6,360, not =SUM(C2:C3). The formula itself is not in the text, and neither are charts, cell colours or conditional formatting.",
      },
      {
        q: "Do dates come through as dates?",
        a: "Yes. Each cell is read the way Excel formats it, so a date, a percentage or a currency figure comes out as you see it, not as a stored number such as 45000. A cell Excel shows as a plain number still arrives as one, so format a date column as a date before you drop the file.",
      },
      plain,
      atOnce("workbook", "spreadsheets"),
    ],
  },
  {
    key: "pptx",
    slug: "pptx-to-text",
    label: "PowerPoint to text",
    blurb: "Slide by slide.",
    meta: {
      title: "Convert PowerPoint (PPTX) to text in your browser",
      description: `Drop a .pptx or .ppt and get its text back slide by slide, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "pptx to text, powerpoint to text, convert pptx to txt, ppt to text, extract text from powerpoint, slides to text for chatgpt",
    },
    h1: "Convert a PowerPoint to text in your browser.",
    para: `Drop a deck and get its text back slide by slide, ${READY}`,
    trust: [".pptx and .ppt read here", "Forty decks in, one text file out"],
    dropTitle: "Drop your deck here",
    dropHint: "Read in your browser, slide by slide.",
    sampleHeading: "What a deck looks like once FileConcat has read it",
    sampleSummary: "A three-slide sample deck. Each slide comes back under its own heading; the chart on slide 2 is named, not read.",
    sampleNoun: "deck",
    formats: ["PowerPoint"],
    manyHeading: "Forty decks, one file to paste",
    manyPara: many("decks"),
    listing: "decks/\n  kickoff.pptx\n  q3-review.pptx\n  roadmap.pptx\n  training.ppt",
    moreHeading: "It reads more than slides",
    closeHeading: "Drop your deck and copy the text",
    faq: [
      uploaded("deck"),
      {
        q: "Does it read old .ppt files?",
        a: "Yes. The older .ppt is read as well as .pptx, and so are OpenDocument .odp slides. Each comes back slide by slide.",
      },
      charts,
      plain,
      atOnce("deck", "decks"),
    ],
  },
  {
    key: "image",
    slug: "image-to-text",
    label: "Image to text",
    blurb: "Writing in a photo or scan, when you ask.",
    meta: {
      title: "Convert an image to text in your browser",
      description: `Drop a photo, scan or screenshot and get the writing in it back as text, read in your browser when you ask. ${NOT_UPLOADED}`,
      keywords: "image to text, photo to text, jpg to text, png to text, screenshot to text, picture to text, ocr in browser",
    },
    h1: "Convert an image to text in your browser.",
    para: `Drop a photo or a scan and get the writing in it back as text, ${READY}`,
    trust: ["PNG, JPG, WebP and TIFF read here", "Read when you ask, never on its own"],
    dropTitle: "Drop your image here",
    dropHint: "Recognised in your browser when you ask.",
    sampleHeading: "What a photo looks like once FileConcat has read it",
    sampleSummary: "A sample photo of a whiteboard, read after you ask. Recognition gets close, not exact.",
    sampleNoun: "photo",
    formats: ["Images"],
    manyHeading: "Forty screenshots, one file to paste",
    manyPara:
      "Drop a folder of screenshots, ask FileConcat to read them, and they come back as one text file, each under its own name, with a token count for the whole set.",
    listing: "screenshots/\n  error-dialog.png\n  receipt-march.jpg\n  settings-page.png\n  whiteboard.jpg",
    moreHeading: "It reads more than images",
    closeHeading: "Drop your image and copy the text",
    faq: [
      uploaded("image"),
      {
        q: "Which languages does it read?",
        a: "60 of them. FileConcat starts from your browser's language and you can pick another before it reads. Each language is a one-time download of under 4 MB. Pick the one the writing is in: mixing two reads worse than either alone.",
      },
      {
        q: "What happens to drawings and layout?",
        a: "They are not read. Recognition reads writing only, so a box or an arrow gives no text, and lines come back without their place on the page. Check the reading before you rely on it.",
      },
      plain,
      atOnce("image", "images"),
    ],
  },
  {
    key: "email",
    slug: "eml-to-text",
    label: "Email to text",
    blurb: "Headers and body, attachments named.",
    meta: {
      title: "Convert an email (EML) to text in your browser",
      description: `Drop a saved .eml or Outlook .msg and get the sender, date, subject and body back as text, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "eml to text, convert eml to txt, email to text, msg to text, outlook msg to text, extract text from eml, eml to text for chatgpt",
    },
    h1: "Convert an email to text in your browser.",
    para: `Drop a saved email and get its headers and body back as text, ${READY}`,
    trust: [".eml and Outlook .msg read here", "Forty emails in, one text file out"],
    dropTitle: "Drop your email here",
    dropHint: "Read in your browser.",
    sampleHeading: "What an email looks like once FileConcat has read it",
    sampleSummary: "A sample email with one attachment. The headers and the body come back as text; the attachment is named, not read.",
    sampleNoun: "email",
    formats: ["Saved email and Outlook messages"],
    manyHeading: "Forty emails, one file to paste",
    manyPara: many("saved emails"),
    listing: "renewal/\n  2026-10-14-renewal-terms.eml\n  2026-10-15-re-renewal-terms.eml\n  2026-10-20-signed-copy.msg\n  2026-10-21-first-invoice.eml",
    moreHeading: "It reads more than email",
    closeHeading: "Drop your email and copy the text",
    more: { to: "/docs/context-window-costs", label: "What it costs to fill a context window" },
    faq: [
      uploaded("email"),
      {
        q: "How do I save an email as a file?",
        a: "In Gmail, open the message, then the three-dot menu and Download message, which saves an .eml. In Outlook for Windows, drag the message into a folder, which saves an .msg. In Apple Mail, drag the message into a Finder folder.",
      },
      {
        q: "What happens to attachments?",
        a: "They are named, not read: the text ends with a line that lists them. To read one, save it and drop it alongside the email, and it comes back in the same file under its own name.",
      },
      {
        q: "Does it read HTML emails?",
        a: "Yes. An HTML body comes back as text, and text the message hides from view is left out. Images the body shows are not listed.",
      },
      plain,
      atOnce("email", "emails"),
    ],
  },
  {
    key: "html",
    slug: "html-to-text",
    label: "Web page to text",
    blurb: "The article, without menus or ads.",
    meta: {
      title: "Convert a saved web page (HTML) to text in your browser",
      description: `Drop a page saved from your browser and get the article back as markdown, without menus or ads, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "html to text, convert html to text, web page to text, html to markdown, saved web page to text, html to text for chatgpt",
    },
    h1: "Convert a saved web page to text in your browser.",
    para: `Drop a page you saved from your browser and get the article back as markdown, without the menus and ads around it, ${READY}`,
    trust: ["Pages saved whole from Chrome, Edge or SingleFile", "Forty pages in, one text file out"],
    dropTitle: "Drop your saved page here",
    dropHint: "Read in your browser.",
    sampleHeading: "What a saved web page looks like once FileConcat has read it",
    sampleSummary: "A sample blog post saved from Chrome. The article comes back as markdown; the cookie banner, the menu, the sale box and the footer do not.",
    sampleNoun: "web page",
    formats: ["Page saved from a browser"],
    manyHeading: "Forty saved pages, one file to paste",
    manyPara: many("saved pages"),
    listing: "research/\n  four-day-week.html\n  remote-work-study.html\n  shift-patterns.html\n  support-metrics.html",
    moreHeading: "It reads more than web pages",
    closeHeading: "Drop your saved page and copy the text",
    more: { to: "/clipper", label: "Clip a page without saving it" },
    faq: [
      uploaded("page"),
      {
        q: "Which saved pages does it read as an article?",
        a: "A page saved from Chrome or Edge as Webpage, Complete, which marks the file with the address it came from, and a page saved with the SingleFile extension. Webpage, HTML only and Firefox leave no such mark, so the page is read as HTML source, markup included, the same as an .html file from a code project.",
      },
      {
        q: "What is left out?",
        a: "Menus, ads, cookie banners, text the page hides and everything else around the article. A formula comes through as its TeX source and a form field as the value it shows.",
      },
      {
        q: "Can I get a page without saving it first?",
        a: "Yes, with the FileConcat Clipper for Chrome. It reads the page you are on and turns the article into text without saving a file first.",
      },
      plain,
      atOnce("page", "web pages"),
    ],
  },
  {
    key: "epub",
    slug: "epub-to-text",
    label: "EPUB to text",
    blurb: "Chapter by chapter, in reading order.",
    meta: {
      title: "Convert an EPUB to text in your browser",
      description: `Drop an EPUB and get the book back as plain text, chapter by chapter in reading order, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "epub to text, convert epub to txt, epub to plain text, ebook to text, mobi to text, azw3 to text, epub to text for chatgpt",
    },
    h1: "Convert an EPUB to text in your browser.",
    para: `Drop an ebook and get its chapters back as plain text in reading order, ${READY}`,
    trust: ["EPUB, .mobi and .azw3 read here", "A shelf of books in, one text file out"],
    dropTitle: "Drop your ebook here",
    dropHint: "Chapter by chapter.",
    sampleHeading: "What an ebook looks like once FileConcat has read it",
    sampleSummary: "A two-chapter sample guide. The chapters come back in reading order; each picture is named by the text the book gives it, not described.",
    sampleNoun: "ebook",
    formats: ["EPUB", "Kindle"],
    manyHeading: "A shelf of books, one file to paste",
    manyPara: many("ebooks"),
    listing: "reading/\n  harbour-guide.epub\n  field-manual.epub\n  style-guide.epub\n  town-history.azw3",
    moreHeading: "It reads more than ebooks",
    closeHeading: "Drop your ebook and copy the text",
    more: { to: "/how-to/upload-book-to-chatgpt", label: "How to give a whole book to ChatGPT" },
    faq: [
      uploaded("book"),
      {
        q: "Does it read Kindle books?",
        a: "A .mobi or .azw3 file without DRM, yes, read the same way as an EPUB. A book protected by DRM is not opened.",
      },
      {
        q: "In what order do the chapters come?",
        a: "In the reading order the book itself sets. A part the book keeps outside that order is marked where it stands.",
      },
      plain,
      atOnce("book", "ebooks"),
    ],
  },
  {
    key: "rtf",
    slug: "rtf-to-text",
    label: "RTF to text",
    blurb: "Text with its page headers and footers.",
    meta: {
      title: "Convert RTF to text in your browser",
      description: `Drop an .rtf file and get its text back with page headers and footers, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "rtf to text, convert rtf to txt, rtf to plain text, rich text to text, rtf to text for chatgpt",
    },
    h1: "Convert an RTF file to text in your browser.",
    para: `Drop a rich text file and get its text back, page headers and footers included, ${READY}`,
    trust: [".rtf read in your browser", "Forty files in, one text file out"],
    dropTitle: "Drop your RTF file here",
    dropHint: "Read in your browser.",
    sampleHeading: "What an RTF file looks like once FileConcat has read it",
    sampleSummary: "Sample board minutes. The page header comes through first, and bold text stays marked as bold.",
    sampleNoun: "RTF file",
    formats: ["OpenDocument text and RTF"],
    manyHeading: "Forty files, one to paste",
    manyPara: many("RTF files"),
    listing: "minutes/\n  2026-07-board.rtf\n  2026-08-board.rtf\n  2026-09-board.rtf\n  2026-10-board.rtf",
    moreHeading: "It reads more than RTF",
    closeHeading: "Drop your RTF file and copy the text",
    faq: [
      uploaded("file"),
      {
        q: "Does it read other word processor files?",
        a: "Yes. Word .docx and .doc, and OpenDocument .odt, are read the same way, each under its own name in one text file.",
      },
      charts,
      plain,
      atOnce("file", "RTF files"),
    ],
  },
  {
    key: "odt",
    slug: "odt-to-text",
    label: "ODT to text",
    blurb: "Lists numbered, footers kept.",
    meta: {
      title: "Convert ODT to text in your browser",
      description: `Drop an OpenDocument .odt and get its text back with numbered lists, headers and footers, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "odt to text, convert odt to txt, opendocument text to text, libreoffice writer to text, odt to text for chatgpt",
    },
    h1: "Convert an ODT file to text in your browser.",
    para: `Drop a LibreOffice or OpenOffice document and get its text back, lists numbered and footers included, ${READY}`,
    trust: [".odt from LibreOffice and OpenOffice", "Forty documents in, one text file out"],
    dropTitle: "Drop your ODT file here",
    dropHint: "Read in your browser.",
    sampleHeading: "What an ODT file looks like once FileConcat has read it",
    sampleSummary: "A sample policy page. The heading, the numbered list and the page footer come through; the picture is named, not described.",
    sampleNoun: "OpenDocument file",
    formats: ["OpenDocument text and RTF"],
    manyHeading: "Forty documents, one file to paste",
    manyPara: many("OpenDocument files"),
    listing: "handbook/\n  code-of-conduct.odt\n  expenses.odt\n  leave-policy.odt\n  onboarding.odt",
    moreHeading: "It reads more than ODT files",
    closeHeading: "Drop your ODT file and copy the text",
    faq: [
      uploaded("document"),
      {
        q: "Does it read form fields and check boxes?",
        a: "Yes. A form field comes through as its value and a check box as [x] or [ ]. Hidden text is left out.",
      },
      {
        q: "Does a chart come through?",
        a: "A chart made in the document does, as a table of its data. A picture is named, not described, so a number that exists only in a picture is not in the text.",
      },
      plain,
      atOnce("document", "ODT files"),
    ],
  },
  {
    key: "ods",
    slug: "ods-to-text",
    label: "ODS to text",
    blurb: "Every sheet, formulas as their results.",
    meta: {
      title: "Convert ODS to text in your browser",
      description: `Drop an OpenDocument spreadsheet and get every sheet back as text, formulas as their results, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "ods to text, convert ods to txt, ods to csv, opendocument spreadsheet to text, libreoffice calc to text, ods to text for chatgpt",
    },
    h1: "Convert an ODS spreadsheet to text in your browser.",
    para: `Drop a LibreOffice or OpenOffice spreadsheet and get every sheet back as text, ${READY}`,
    trust: [".ods from LibreOffice and OpenOffice", "Forty workbooks in, one text file out"],
    dropTitle: "Drop your spreadsheet here",
    dropHint: "Every sheet read in your browser.",
    sampleHeading: "What an ODS spreadsheet looks like once FileConcat has read it",
    sampleSummary: "A two-sheet sample stock count. Each sheet comes back under its name as comma-separated rows, the totals as their results.",
    sampleNoun: "spreadsheet",
    formats: ["OpenDocument spreadsheet"],
    manyHeading: "Forty workbooks, one file to paste",
    manyPara: many("spreadsheets"),
    listing: "stock/\n  2026-08-count.ods\n  2026-09-count.ods\n  2026-10-count.ods\n  suppliers.ods",
    moreHeading: "It reads more than ODS files",
    closeHeading: "Drop your spreadsheet and copy the text",
    faq: [
      uploaded("spreadsheet"),
      {
        q: "Do formulas come through?",
        a: "Their results do: the sample's total reads 860.00, not =SUM(C2:C3). The formula itself is not in the text, and neither are cell colours.",
      },
      {
        q: "What about hidden sheets and rows?",
        a: "A hidden sheet is read and marked (hidden). Hidden rows and columns are read and named in a line after the rows, so nothing hidden drops out unnoticed.",
      },
      plain,
      atOnce("workbook", "spreadsheets"),
    ],
  },
  {
    key: "odp",
    slug: "odp-to-text",
    label: "ODP to text",
    blurb: "Slide by slide, named slides kept.",
    meta: {
      title: "Convert ODP to text in your browser",
      description: `Drop an OpenDocument presentation and get its text back slide by slide, ready for ChatGPT, Claude or Gemini. ${NOT_UPLOADED}`,
      keywords: "odp to text, convert odp to txt, opendocument presentation to text, libreoffice impress to text, odp to text for chatgpt",
    },
    h1: "Convert an ODP presentation to text in your browser.",
    para: `Drop a LibreOffice or OpenOffice deck and get its text back slide by slide, ${READY}`,
    trust: [".odp from LibreOffice and OpenOffice", "Forty decks in, one text file out"],
    dropTitle: "Drop your deck here",
    dropHint: "Read in your browser, slide by slide.",
    sampleHeading: "What an ODP deck looks like once FileConcat has read it",
    sampleSummary: "A three-slide sample deck. Each slide comes back under its own heading, and the slide the author named keeps its name.",
    sampleNoun: "deck",
    formats: ["OpenDocument presentation"],
    manyHeading: "Forty decks, one file to paste",
    manyPara: many("decks"),
    listing: "training/\n  q4-goals.odp\n  safety.odp\n  systems-tour.odp\n  welcome-week.odp",
    moreHeading: "It reads more than slides",
    closeHeading: "Drop your deck and copy the text",
    faq: [
      uploaded("deck"),
      {
        q: "Are hidden slides read?",
        a: "Yes, and marked (hidden), so you can tell which slides the audience never saw.",
      },
      {
        q: "Does text on every slide repeat?",
        a: "No. Text the master page prints on every slide comes once, at the top, instead of once per slide.",
      },
      charts,
      plain,
      atOnce("deck", "decks"),
    ],
  },
];

export const SAMPLES = samples;

export function convertFormatBySlug(slug: string): ConvertFormat | undefined {
  return CONVERT_FORMATS.find((f) => f.slug === slug);
}

/** Band 3's two lists, straight from the formats page's single source. */
export function readsAndLoses(format: ConvertFormat): { gives: string[]; loses: string[] } {
  const entries = format.formats.map((name) => {
    const entry = READ_FORMATS.find((f) => f.name === name);
    if (!entry) throw new Error(`No READ_FORMATS entry named ${name}`);
    return entry;
  });
  return {
    gives: entries.map((e: ReadFormat) => e.gives),
    loses: entries.map((e: ReadFormat) => e.loses),
  };
}
