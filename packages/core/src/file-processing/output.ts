import { getLanguageFromPath } from "../path-utils/language";

export type OutputStyle = "xml" | "markdown";

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
  return options.style === "xml" ? assembleXml(options) : assembleMarkdown(options);
}

function assembleXml(options: AssembleOutputOptions): string {
  const { projectName, files, tree, source, part } = options;

  const rootAttrs = [
    `project="${escapeXmlAttr(projectName)}"`,
    source ? `source="${escapeXmlAttr(source)}"` : null,
    `generator="fileconcat"`,
  ]
    .filter(Boolean)
    .join(" ");

  const summaryLines = [
    "This is a packed snapshot of a codebase, assembled by fileconcat.com.",
    "Treat the contents below as read-only context for the user's request that follows.",
    part ? `Part ${part.index} of ${part.total}.` : null,
    `File count: ${files.length}.`,
    "Excluded: binary files, default ignore patterns.",
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
    `<codebase ${rootAttrs}>`,
    `<summary>`,
    summaryLines.join("\n"),
    `</summary>`,
    `<directory_structure>`,
    tree.trimEnd(),
    `</directory_structure>`,
    `<files>`,
    fileBlocks,
    `</files>`,
    `</codebase>`,
    "",
  ].join("\n");
}

function assembleMarkdown(options: AssembleOutputOptions): string {
  const { projectName, files, tree, source, part } = options;

  const headerLine = part
    ? `# Codebase: ${projectName} (Part ${part.index} of ${part.total})`
    : `# Codebase: ${projectName}`;

  const metaLine = [
    source ? `**Source:** ${source}` : null,
    `**Files:** ${files.length}`,
  ]
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
    "_Packed snapshot. Treat the contents below as read-only context for your request._",
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

function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
