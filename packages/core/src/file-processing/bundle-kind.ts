/**
 * What a bundle is mostly made of, used to name the output's root tag and
 * summary noun (ADR-0005). Deliberately coarse — a hint for the consuming
 * model, not a precise taxonomy.
 */
export type BundleKind = "codebase" | "documents" | "files";

/**
 * Programming and markup source extensions — a "codebase" signal. This is a
 * deliberate, stable list kept separate from the syntax-highlighting map
 * (`getLanguageFromPath`): highlighting can't tell a real language from an
 * unknown extension, and this classification wants that distinction. A language
 * missing here simply abstains (falls to the neutral bucket) rather than being
 * misfiled, so the failure mode is safe.
 */
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "java", "cpp", "cc", "cxx",
  "c", "h", "hpp", "cs", "php", "go", "rs", "swift", "kt", "kts", "scala", "sh",
  "bash", "zsh", "fish", "ps1", "html", "htm", "css", "scss", "sass", "less",
  "sql", "graphql", "gql", "proto", "r", "lua", "pl", "pm", "ex", "exs", "erl",
  "hrl", "clj", "cljs", "cljc", "dart", "vue", "svelte", "astro", "elm", "hs",
]);

/**
 * Prose extensions — reads as documents. Includes the office formats the router
 * extracts, but this is a *naming* heuristic over paths that already survived
 * ingest, not a routing decision: nothing here decides whether a file is read,
 * only what noun the summary uses (ADR-0011 keeps those two jobs apart).
 */
const PROSE_EXTENSIONS: ReadonlySet<string> = new Set([
  "md", "mdx", "markdown", "txt", "text", "rst", "org", "adoc", "asciidoc", "tex",
  "pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "epub",
]);

type Bucket = "code" | "doc" | "other";

function classifyFile(path: string): Bucket {
  const name = path.toLowerCase();
  // Extensionless build/config source that still reads as code.
  if (name.includes("dockerfile") || name.includes("makefile")) return "code";

  const ext = name.split(".").pop() ?? "";
  if (PROSE_EXTENSIONS.has(ext)) return "doc";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  // config/data (json, yaml, csv, …), unknown, and extensionless files abstain.
  return "other";
}

/**
 * Decide a bundle's kind from its file paths. Pure and deterministic — a
 * function of the set alone, with no clock, randomness, or order-dependence, so
 * the same folder always yields the same tag (ADR-0001, ADR-0005). The tag is
 * the plurality of CODE vs DOC by file count; a tie or an all-OTHER bundle is
 * neutral `files`.
 */
export function classifyBundleKind(paths: readonly string[]): BundleKind {
  let code = 0;
  let doc = 0;
  for (const path of paths) {
    const bucket = classifyFile(path);
    if (bucket === "code") code++;
    else if (bucket === "doc") doc++;
  }
  if (code > doc) return "codebase";
  if (doc > code) return "documents";
  return "files";
}
