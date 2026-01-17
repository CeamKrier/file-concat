// Language mapping for syntax highlighting
const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  go: "go",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
  ps1: "powershell",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  conf: "conf",
  cfg: "ini",
  md: "markdown",
  mdx: "mdx",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  dockerfile: "dockerfile",
  makefile: "makefile",
  r: "r",
  m: "matlab",
  vim: "vim",
  lua: "lua",
  pl: "perl",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  clj: "clojure",
  cljs: "clojure",
  dart: "dart",
  vue: "vue",
  svelte: "svelte",
};

/**
 * Gets the language identifier for syntax highlighting based on file extension
 * @param filePath - Path to the file
 * @returns Language identifier for code blocks (e.g., 'typescript', 'python', 'json')
 */
export const getLanguageFromPath = (filePath: string): string => {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";

  // Special cases for files without extensions
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  if (filePath.toLowerCase().includes("makefile")) return "makefile";

  return languageMap[extension] || extension || "text";
};
