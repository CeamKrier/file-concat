import { READ_FORMATS, type ReadFormat } from "~/data/formats";
import samples from "~/data/convert-samples.json";

/**
 * The five /convert/<format>-to-text pages, one template, the strings that
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
      keywords: "pdf to text, convert pdf to text, pdf to txt, extract text from pdf, scanned pdf to text, pdf to text for chatgpt",
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
        a: "Yes. Pages with no text of their own are read by text recognition in your browser and marked as recognised in the bundle, in a fully scanned PDF and in one where only some pages are scans. Up to three such documents and 8 MB per drop start on their own; past that it asks first. The first time, your browser downloads the recognition engine and one language file from a public CDN; your PDF is not part of that request.",
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
