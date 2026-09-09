/**
 * Cuts an assembled bundle into the four things that are not file content, so a
 * token count can be attributed rather than guessed.
 *
 * `assembleOutput` returns one string. This returns the same string cut into
 * labelled pieces that concatenate back to it exactly, byte for byte. The
 * equality is asserted on every call, which is the whole safety story: if the
 * assembly ever changes shape, the split fails loudly instead of quietly
 * mislabelling a section.
 *
 * The components:
 *
 *   header   the preamble the model is meant to read first, plus the project
 *            name and source. XML: the root open tag and the <summary> block.
 *            Markdown and plain: the title line and the same summary lines.
 *   tree     the whole directory-structure section, wrapper included, because
 *            the unit that matters is what disappears if the tree is removed.
 *   markers  the per-file delimiters: the opening tag / heading + fence / rule,
 *            the closing one, and the newlines that join one file to the next.
 *   chrome   style-specific structure that is none of the above. XML pays for
 *            <files> and the root close tag, markdown for a "## Files" heading,
 *            plain for nothing.
 *   content  the file text itself, emitted verbatim by every style.
 *
 * Only `header`, `tree` and `chrome` are reconstructed from literal strings
 * here. The per-file markers are found by locating each file's content in the
 * bundle and taking everything between, so the fence-length rule and the
 * language lookup stay in core and are never reimplemented.
 *
 * One known limit: a file whose entire content is also a substring of its own
 * marker (a file containing just its own path) would have a few characters
 * attributed to content instead of markers. The partition stays exact; only the
 * label moves, and no such file exists in the sample.
 */

import { assembleOutput, type AssembleOutputOptions, type OutputStyle } from "@fileconcat/core";

export type Component = "header" | "tree" | "markers" | "chrome" | "content";

export interface Piece {
  component: Component;
  text: string;
}

/** The tree section exactly as each style writes it, wrapper included. */
function treeSection(style: OutputStyle, tree: string): string {
  const t = tree.trimEnd();
  switch (style) {
    case "xml":
      return `<directory_structure>\n${t}\n</directory_structure>\n`;
    case "markdown":
      return `## Directory structure\n\n\`\`\`\n${t}\n\`\`\`\n\n`;
    case "plain":
      return `Directory structure:\n${t}\n\n`;
  }
}

/** What sits between the tree section and the first file's marker. */
function chromeOpen(style: OutputStyle): string {
  switch (style) {
    case "xml":
      return "<files>\n";
    case "markdown":
      return "## Files\n\n";
    case "plain":
      return "";
  }
}

/**
 * What closes the bundle after the last file. Only XML has any: the root tag
 * name is read back off the bundle rather than reclassified, so the bundle-kind
 * rule (ADR-0005) stays in core.
 */
function chromeClose(style: OutputStyle, bundle: string): string {
  if (style !== "xml") return "";
  const tag = /^<([A-Za-z_][\w-]*)[ >]/.exec(bundle)?.[1];
  if (!tag) throw new Error("xml bundle does not open with a root tag");
  return `</files>\n</${tag}>\n`;
}

export interface SplitBundle {
  bundle: string;
  pieces: Piece[];
}

export function splitBundle(options: AssembleOutputOptions): SplitBundle {
  const bundle = assembleOutput(options);
  const style = options.style;

  const section = treeSection(style, options.tree);
  const treeAt = bundle.indexOf(section);
  if (treeAt === -1) throw new Error(`${style}: could not locate the tree section`);

  const open = chromeOpen(style);
  const close = chromeClose(style, bundle);
  const afterTree = bundle.slice(treeAt + section.length);
  if (!afterTree.startsWith(open)) throw new Error(`${style}: bundle does not open the file list`);
  if (!afterTree.endsWith(close)) throw new Error(`${style}: bundle does not close the file list`);

  const body = afterTree.slice(open.length, afterTree.length - close.length);

  const pieces: Piece[] = [
    { component: "header", text: bundle.slice(0, treeAt) },
    { component: "tree", text: section },
    { component: "chrome", text: open },
  ];

  let cursor = 0;
  for (const file of options.files) {
    const at = body.indexOf(file.content, cursor);
    if (at === -1) throw new Error(`${style}: content of ${file.path} not found in the bundle`);
    pieces.push({ component: "markers", text: body.slice(cursor, at) });
    pieces.push({ component: "content", text: file.content });
    cursor = at + file.content.length;
  }
  pieces.push({ component: "markers", text: body.slice(cursor) });
  pieces.push({ component: "chrome", text: close });

  const rejoined = pieces.map((p) => p.text).join("");
  if (rejoined !== bundle) {
    throw new Error(`${style}: split does not reassemble (${rejoined.length} vs ${bundle.length} chars)`);
  }
  return { bundle, pieces };
}
