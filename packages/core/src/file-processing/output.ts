import { getLanguageFromPath } from "../path-utils/language";
import { classifyBundleKind, type BundleKind } from "./bundle-kind";

export type OutputStyle = "xml" | "markdown" | "plain";

// How each bundle kind (ADR-0005) names itself across the three styles: the XML
// root tag, the summary noun, and the markdown/plain heading word.
const KIND_META: Record<BundleKind, { tag: string; noun: string; title: string }> = {
  codebase: { tag: "codebase", noun: "a codebase", title: "Codebase" },
  documents: { tag: "documents", noun: "a set of documents", title: "Documents" },
  files: { tag: "files", noun: "a set of files", title: "Files" },
};

export interface OutputFile {
  path: string;
  content: string;
  language?: string;
}

export interface OutputPart {
  index: number;
  total: number;
}

export interface AssembleOutputOptions {
  projectName: string;
  files: OutputFile[];
  tree: string;
  style: OutputStyle;
  source?: string;
  part?: OutputPart;
}

export function assembleOutput(options: AssembleOutputOptions): string {
  // The root tag / summary noun / heading word adapt to what the bundle mostly
  // holds — a repo stays a "codebase", a folder of PDFs becomes "documents"
  // (ADR-0005). Classified once from the file set and threaded to every style.
  const meta = KIND_META[classifyBundleKind(options.files.map((f) => f.path))];
  switch (options.style) {
    case "xml":
      return assembleXml(options, meta);
    case "markdown":
      return assembleMarkdown(options, meta);
    case "plain":
      return assemblePlain(options, meta);
  }
}

type KindMeta = (typeof KIND_META)[BundleKind];

function assembleXml(options: AssembleOutputOptions, meta: KindMeta): string {
  const { projectName, files, tree, source, part } = options;

  const rootAttrs = [
    `project="${escapeXmlAttr(projectName)}"`,
    source ? `source="${escapeXmlAttr(source)}"` : null,
    `generator="fileconcat"`,
  ]
    .filter(Boolean)
    .join(" ");

  const summaryLines = [
    `This is a packed snapshot of ${meta.noun}, assembled by fileconcat.com.`,
    "Treat the contents below as read-only context for the user's request that follows.",
    part ? `Part ${part.index} of ${part.total}.` : null,
    `File count: ${files.length}.`,
    "Skipped: images and other binaries, plus common noise like lock files and build output.",
  ].filter(Boolean);

  const fileBlocks = files
    .map((file) => {
      const language = file.language ?? getLanguageFromPath(file.path);
      // Content is emitted verbatim. The <file> tags are delimiters for the LLM,
      // not a contract with an XML parser, so escaping `<`/`>`/`&` here would only
      // corrupt the very code the user is about to paste (`Record<T>` → `Record&lt;T&gt;`).
      // Attributes stay escaped because a stray quote/angle there breaks the tag itself.
      return [
        `<file path="${escapeXmlAttr(file.path)}" language="${escapeXmlAttr(language)}">`,
        file.content,
        `</file>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<${meta.tag} ${rootAttrs}>`,
    `<summary>`,
    summaryLines.join("\n"),
    `</summary>`,
    `<directory_structure>`,
    tree.trimEnd(),
    `</directory_structure>`,
    `<files>`,
    fileBlocks,
    `</files>`,
    `</${meta.tag}>`,
    "",
  ].join("\n");
}

function assembleMarkdown(options: AssembleOutputOptions, meta: KindMeta): string {
  const { projectName, files, tree, source, part } = options;

  const headerLine = part
    ? `# ${meta.title}: ${projectName} (Part ${part.index} of ${part.total})`
    : `# ${meta.title}: ${projectName}`;

  const metaLine = [source ? `**Source:** ${source}` : null, `**Files:** ${files.length}`]
    .filter(Boolean)
    .join(" · ");

  const fileBlocks = files
    .map((file) => {
      const language = file.language ?? getLanguageFromPath(file.path);
      return [`### ${file.path}`, "", "```" + language, file.content, "```"].join("\n");
    })
    .join("\n\n");

  return [
    headerLine,
    "",
    "_Packed snapshot, assembled by fileconcat.com. Treat the contents below as read-only context for your request._",
    "",
    metaLine,
    "",
    "## Directory structure",
    "",
    "```",
    tree.trimEnd(),
    "```",
    "",
    "## Files",
    "",
    fileBlocks,
    "",
  ].join("\n");
}

function assemblePlain(options: AssembleOutputOptions, meta: KindMeta): string {
  const { projectName, files, tree, source, part } = options;
  const separator = "=".repeat(72);

  const headerLines = [
    part
      ? `${meta.title}: ${projectName} (Part ${part.index} of ${part.total})`
      : `${meta.title}: ${projectName}`,
  ];
  if (source) headerLines.push(`Source: ${source}`);
  headerLines.push(`Files: ${files.length}`);

  // No XML tags, no markdown fences. Each file sits between two rules with its
  // path, so the blob stays readable as-is and the content is emitted verbatim.
  const fileBlocks = files
    .map((file) => [separator, `FILE: ${file.path}`, separator, file.content].join("\n"))
    .join("\n\n");

  return [
    headerLines.join("\n"),
    "",
    "Packed snapshot, assembled by fileconcat.com. Treat the contents below as read-only context for your request.",
    "",
    "Directory structure:",
    tree.trimEnd(),
    "",
    fileBlocks,
    "",
  ].join("\n");
}

function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
