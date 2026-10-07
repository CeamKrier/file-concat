/**
 * What the browser tool reads, the one place it is written down.
 *
 * `/docs/formats` and the homepage format chips render from this list, and
 * research posts link to that page instead of re-stating it, so a reader that
 * ships changes one entry here rather than thirty sentences across the site.
 * `tests/formats.test.ts` holds the list to the code both ways: every format
 * the router, the recognition offer or the speech offer can act on has an
 * entry, and every entry names a format one of them acts on.
 *
 * `formats` are the router's and the signature table's names for the bytes
 * (`cfb` is every 97-2003 Office file and Outlook's .msg, `iso-bmff` is mp4,
 * mov and m4a), never extensions: the extension list is for people.
 */
export interface ReadFormat {
  group: FormatGroup;
  name: string;
  extensions: readonly string[];
  formats: readonly string[];
  /** "auto" is read on drop; "on-request" waits for the person to ask. */
  how: "auto" | "on-request";
  /** What reaches the bundle. */
  gives: string;
  /** What does not, said plainly. */
  loses: string;
}

export type FormatGroup =
  | "Documents"
  | "Spreadsheets"
  | "Slides"
  | "Books"
  | "Email"
  | "Notebooks"
  | "Subtitles"
  | "Web pages"
  | "Archives"
  | "Images"
  | "Audio and video";

export const READ_FORMATS: readonly ReadFormat[] = [
  {
    group: "Documents",
    name: "PDF",
    extensions: ["pdf"],
    formats: ["pdf"],
    how: "auto",
    gives: "The text, page by page under a page heading.",
    loses: "Pictures and charts are not described. A password-protected PDF is not opened.",
  },
  {
    group: "Documents",
    name: "Scanned PDF pages",
    extensions: ["pdf"],
    formats: ["pdf"],
    how: "auto",
    gives:
      "Pages with no text of their own are read by text recognition and marked in the bundle. Up to three such documents and 8 MB per drop start on their own; past that it asks first.",
    loses: "A table comes through as loose lines. A faint or crooked scan reads less well.",
  },
  {
    group: "Documents",
    name: "Word",
    extensions: ["docx", "docm", "dotx", "dotm", "doc"],
    formats: ["docx", "docm", "dotx", "dotm", "cfb"],
    how: "auto",
    gives: "Text with headings, tables, footnotes and link addresses. Tracked deletions are left out.",
    loses: "Pictures and charts are not described.",
  },
  {
    group: "Documents",
    name: "OpenDocument text and RTF",
    extensions: ["odt", "rtf"],
    formats: ["odt", "rtf"],
    how: "auto",
    gives: "The text.",
    loses: "Pictures and charts are not described.",
  },
  {
    group: "Spreadsheets",
    name: "Excel",
    extensions: ["xlsx", "xlsm", "xlsb", "xltx", "xltm", "xls"],
    formats: ["xlsx", "xlsm", "xlsb", "xltx", "xltm", "cfb"],
    how: "auto",
    gives: "Every sheet under its name, rows as comma-separated cells, each cell as Excel shows it.",
    loses: "Formulas (their results come through), charts, cell colours and conditional formatting.",
  },
  {
    group: "Spreadsheets",
    name: "OpenDocument spreadsheet",
    extensions: ["ods"],
    formats: ["ods"],
    how: "auto",
    gives: "Every sheet's cells as text.",
    loses: "Formulas (their results come through), charts and cell colours.",
  },
  {
    group: "Slides",
    name: "PowerPoint",
    extensions: ["pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "ppt"],
    formats: ["pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "cfb"],
    how: "auto",
    gives: "The text of each slide, slide by slide.",
    loses: "A chart or diagram that exists only as a picture is not described.",
  },
  {
    group: "Slides",
    name: "OpenDocument presentation",
    extensions: ["odp"],
    formats: ["odp"],
    how: "auto",
    gives: "The text of each slide.",
    loses: "A chart or diagram that exists only as a picture is not described.",
  },
  {
    group: "Books",
    name: "EPUB",
    extensions: ["epub"],
    formats: ["epub"],
    how: "auto",
    gives: "The chapters as plain text, in reading order.",
    loses: "Pictures are not described.",
  },
  {
    group: "Books",
    name: "Kindle",
    extensions: ["mobi", "azw3"],
    formats: ["mobi"],
    how: "auto",
    gives: "The book's text, read the same way an EPUB is.",
    loses: "Pictures are not described. A book protected by DRM is not opened.",
  },
  {
    group: "Email",
    name: "Saved email and Outlook messages",
    extensions: ["eml", "msg"],
    formats: ["eml", "cfb"],
    how: "auto",
    gives: "From, To, Cc, Date and Subject, then the decoded body.",
    loses: "Attachments are named, not read.",
  },
  {
    group: "Notebooks",
    name: "Jupyter notebook",
    extensions: ["ipynb"],
    formats: ["ipynb"],
    how: "auto",
    gives: "Markdown: the prose, the code in fences and the text output.",
    loses: "Embedded images are dropped and counted.",
  },
  {
    group: "Subtitles",
    name: "Caption files",
    extensions: ["srt", "vtt"],
    formats: ["srt", "vtt"],
    how: "auto",
    gives: "The transcript, without cue numbers or timestamps.",
    loses: "Who is speaking, unless the captions say so.",
  },
  {
    group: "Audio and video",
    name: "Video subtitle track",
    extensions: ["mp4", "m4v", "mov", "mkv", "webm"],
    formats: ["iso-bmff", "matroska"],
    how: "auto",
    gives: "A video's own text subtitle track, as a transcript.",
    loses: "A video with no subtitle track gives nothing here; transcribe it instead.",
  },
  {
    group: "Web pages",
    name: "Page saved from a browser",
    extensions: ["html", "htm"],
    formats: ["html"],
    how: "auto",
    gives: "The article as markdown.",
    loses: "Menus, ads and everything else outside the article. HTML source code stays code.",
  },
  {
    group: "Archives",
    name: "Archives",
    extensions: ["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz"],
    formats: ["zip", "tar", "gz", "tar.gz", "7z", "rar", "bz2", "xz"],
    how: "auto",
    gives: "Unpacked in the browser; every file inside is read as if dropped on its own.",
    loses: "A password-protected or damaged archive is not opened.",
  },
  {
    group: "Images",
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "tif", "tiff", "webp"],
    formats: ["png", "jpeg", "gif", "tiff", "webp"],
    how: "on-request",
    gives: "Writing in the image, read by text recognition when you ask.",
    loses: "A photo with no writing gives nothing. Layout is not kept.",
  },
  {
    group: "Audio and video",
    name: "Recordings",
    extensions: ["mp3", "m4a", "aac", "flac", "ogg", "wav", "mp4", "mov", "mkv", "webm"],
    formats: ["mp3", "aac", "flac", "ogg", "wave", "iso-bmff", "matroska"],
    how: "on-request",
    gives:
      "A transcript made in the browser when you ask, plus a video's on-screen text. The speech model is downloaded once.",
    loses: "Speaker names. A noisy recording transcribes less well.",
  },
];

/**
 * The homepage's "read in the tab" chips, grouped by what the file is rather
 * than one pill per extension: a reader recognises a spreadsheet icon faster
 * than "ods", and seven chips wrap where sixteen pills did not. Only what is
 * read on drop, and only the extensions people use most; the formats page
 * carries the rest. The test holds every extension here to an "auto" entry.
 */
export interface FormatChip {
  kind: "documents" | "spreadsheets" | "slides" | "ebooks" | "email" | "notebooks" | "subtitles";
  ext: readonly string[];
}

export const FORMAT_CHIPS: readonly FormatChip[] = [
  { kind: "documents", ext: ["pdf", "doc", "docx", "odt", "rtf"] },
  { kind: "spreadsheets", ext: ["xls", "xlsx", "xlsb", "ods"] },
  { kind: "slides", ext: ["ppt", "pptx", "odp"] },
  { kind: "ebooks", ext: ["epub", "mobi", "azw3"] },
  { kind: "email", ext: ["eml", "msg"] },
  { kind: "notebooks", ext: ["ipynb"] },
  { kind: "subtitles", ext: ["vtt", "srt"] },
];
