/**
 * Every /convert page as the rest of the site links to it: the footer and the
 * /docs/formats rows. Kept apart from `convert-formats.ts` so those surfaces do
 * not carry each page's FAQ and sample; tests/convert-formats.test.ts holds the
 * two lists, and the sitemap, to the same pages.
 */
export const CONVERT_LINKS: { slug: string; label: string; formats: string[] }[] = [
  { slug: "pdf-to-text", label: "PDF to text", formats: ["PDF", "Scanned PDF pages"] },
  { slug: "docx-to-text", label: "Word to text", formats: ["Word"] },
  { slug: "excel-to-text", label: "Excel to text", formats: ["Excel"] },
  { slug: "pptx-to-text", label: "PowerPoint to text", formats: ["PowerPoint"] },
  { slug: "image-to-text", label: "Image to text", formats: ["Images"] },
  { slug: "eml-to-text", label: "Email to text", formats: ["Saved email and Outlook messages"] },
  { slug: "html-to-text", label: "Web page to text", formats: ["Page saved from a browser"] },
  { slug: "epub-to-text", label: "EPUB to text", formats: ["EPUB", "Kindle"] },
  { slug: "rtf-to-text", label: "RTF to text", formats: ["OpenDocument text and RTF"] },
  { slug: "odt-to-text", label: "ODT to text", formats: ["OpenDocument text and RTF"] },
  { slug: "ods-to-text", label: "ODS to text", formats: ["OpenDocument spreadsheet"] },
  { slug: "odp-to-text", label: "ODP to text", formats: ["OpenDocument presentation"] },
];
