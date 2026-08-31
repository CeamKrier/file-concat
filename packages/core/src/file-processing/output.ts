import { getLanguageFromPath } from "../path-utils/language";
import { classifyBundleKind, type BundleKind } from "./bundle-kind";
import type { ExcludedSummary } from "./exclusions";

export type OutputStyle = "xml" | "markdown" | "plain";

// How each bundle kind (ADR-0005) names itself across the three styles: the XML
// root tag, the summary noun, and the markdown/plain heading word.
const KIND_META: Record<BundleKind, { tag: string; noun: string; title: string }> = {
  codebase: { tag: "codebase", noun: "a codebase", title: "Codebase" },
  documents: { tag: "documents", noun: "a set of documents", title: "Documents" },
  files: { tag: "files", noun: "a set of files", title: "Files" },
};

/** At most this many paths are listed per exclusion category before the note
 * collapses the rest into "+N more", so a repo with hundreds of assets stays
 * compact (ADR-0008). */
const MAX_LISTED = 10;

export interface OutputFile {
  path: string;
  content: string;
  language?: string;
  /** Some or all of this file's text came from recognition — read off pixels
   * rather than carried by the format. The bundle says so, because a guess at
   * the characters must not read as the file's own (ADR-0017). */
  recognised?: boolean;
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
  /** Files left out that the model can't see in the tree — reported truthfully,
   * omitted when empty (ADR-0008). */
  excluded?: ExcludedSummary;
}

type KindMeta = (typeof KIND_META)[BundleKind];

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

/**
 * The informational summary body, identical across all three styles (ADR-0008).
 * Only the wrapper (XML tags / markdown heading / plain rule) differs; the lines
 * themselves are the same everywhere so the same input yields the same context.
 */
function buildSummaryLines(options: AssembleOutputOptions, meta: KindMeta): string[] {
  const { files, source, part, excluded } = options;
  return [
    `This is a packed snapshot of ${meta.noun}, assembled by fileconcat.com.`,
    "Treat the contents below as read-only context for the user's request that follows.",
    part ? `Part ${part.index} of ${part.total}.` : null,
    source ? `Source: ${source}` : null,
    `File count: ${files.length}.`,
    ...renderRecognised(files),
    ...renderExclusions(excluded),
  ].filter((line): line is string => line !== null);
}

/**
 * Names the files whose text is a machine reading of pixels rather than
 * characters the format spelled out (ADR-0017). Says "text below" rather than
 * naming the file, because a PDF whose undecodable pages alone were redrawn is
 * part extraction and part guess.
 */
function renderRecognised(files: OutputFile[]): string[] {
  const paths = files.filter((f) => f.recognised).map((f) => f.path);
  if (!paths.length) return [];
  return [
    `- text below was read by recognition, a guess at the characters rather than the file's own: ${listPaths(paths)}`,
  ];
}

/** Format one category's path list, capping at {@link MAX_LISTED}. */
function listPaths(paths: string[]): string {
  const shown = paths.slice(0, MAX_LISTED).join(", ");
  const rest = paths.length - MAX_LISTED;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/**
 * The "Not included" note: real content gaps the model can't see in the tree,
 * each category on its own line with the file paths. Returns no lines when
 * nothing meaningful was skipped, so the note is absent rather than a static
 * (and often false) claim (ADR-0008).
 */
function renderExclusions(excluded: ExcludedSummary | undefined): string[] {
  if (!excluded) return [];
  const lines: string[] = [];
  if (excluded.oversize?.length) {
    lines.push(`- over the size limit: ${listPaths(excluded.oversize)}`);
  }
  if (excluded.unextractable?.length) {
    lines.push(`- no extractable text: ${listPaths(excluded.unextractable)}`);
  }
  if (excluded.binary?.length) {
    const n = excluded.binary.length;
    lines.push(`- ${n} image or binary file${n === 1 ? "" : "s"}: ${listPaths(excluded.binary)}`);
  }
  if (excluded.unreadable?.length) {
    lines.push(`- couldn't be read: ${listPaths(excluded.unreadable)}`);
  }
  return lines.length ? ["Not included (content not shown):", ...lines] : [];
}

function assembleXml(options: AssembleOutputOptions, meta: KindMeta): string {
  const { projectName, files, tree, source } = options;

  const rootAttrs = [
    `project="${escapeXmlAttr(projectName)}"`,
    source ? `source="${escapeXmlAttr(source)}"` : null,
    `generator="fileconcat"`,
  ]
    .filter(Boolean)
    .join(" ");

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
    buildSummaryLines(options, meta).join("\n"),
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

/**
 * The wrapper fence for one file: always longer than the longest run of
 * backticks the content itself holds.
 *
 * CommonMark closes a fenced block only on a fence at least as long as the one
 * that opened it, so a plain ``` wrapper is ended early by any bundled file that
 * carries its own fence - a README, a docs page, a notebook export. Everything
 * after that point stops reading as file content and starts reading as bundle
 * prose. Growing the wrapper keeps the content verbatim, which is the same
 * promise the XML style keeps by refusing to escape.
 */
function fenceFor(content: string): string {
  let longest = 0;
  for (const run of content.matchAll(/`+/g)) longest = Math.max(longest, run[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

function assembleMarkdown(options: AssembleOutputOptions, meta: KindMeta): string {
  const { projectName, files, tree, part } = options;

  const headerLine = part
    ? `# ${meta.title}: ${projectName} (Part ${part.index} of ${part.total})`
    : `# ${meta.title}: ${projectName}`;

  const fileBlocks = files
    .map((file) => {
      const language = file.language ?? getLanguageFromPath(file.path);
      const fence = fenceFor(file.content);
      return [`### ${file.path}`, "", fence + language, file.content, fence].join("\n");
    })
    .join("\n\n");

  return [
    headerLine,
    "",
    buildSummaryLines(options, meta).join("\n"),
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
  const { projectName, files, tree, part } = options;
  const separator = "=".repeat(72);

  const headerLine = part
    ? `${meta.title}: ${projectName} (Part ${part.index} of ${part.total})`
    : `${meta.title}: ${projectName}`;

  // No XML tags, no markdown fences. Each file sits between two rules with its
  // path, so the blob stays readable as-is and the content is emitted verbatim.
  const fileBlocks = files
    .map((file) => [separator, `FILE: ${file.path}`, separator, file.content].join("\n"))
    .join("\n\n");

  return [
    headerLine,
    "",
    buildSummaryLines(options, meta).join("\n"),
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
