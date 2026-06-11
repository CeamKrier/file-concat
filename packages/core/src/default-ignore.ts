
export const DEFAULT_IGNORE_PATTERNS = [
  // Version control
  ".git",
  ".hg",
  ".svn",

  // Dependency directories
  "node_modules",
  "bower_components",
  "vendor",

  // Lock files
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "poetry.lock",

  // Build outputs
  "dist",
  "build",
  "out",
  "target",

  // Cache directories
  ".cache",
  ".parcel-cache",
  ".sass-cache",
  ".npm",
  ".yarn",
  ".eslintcache",

  // Coverage
  "coverage",
  ".nyc_output",

  // Logs
  "*.log",

  // Test files (optional - some may want to include these)
  // "*.test.ts",
  // "*.test.tsx",
  // "*.test.js",
  // "*.spec.ts",
  // "*.spec.tsx",
  // "*.spec.js",
  "__tests__",

  // IDE/Editor
  ".vscode",
  ".idea",
  "*.swp",
  "*.swo",
  ".vs",

  // Framework/Tool specific
  ".turbo",
  ".vercel",
  ".expo",
  ".next",
  ".nuxt",
  ".output",
  ".nx",

  // OS files
  ".DS_Store",
  "Thumbs.db",

  // Temp files
  "tmp",
  "temp",

  // Python
  "__pycache__",
  "*.py[cod]",
  "venv",
  ".venv",
  "*.egg-info",

  // Build artifacts
  "tsconfig.tsbuildinfo",

  // Environment files
  ".env",
  ".env.*",

  // Minified files
  "*.min.js",
  "*.min.css",

  // Source maps
  "*.map",

  // Auto-generated source
  "*.gen.*",
  "*.generated.*",

  // Test snapshots
  "*.snap",

  // Infrastructure state (often contains secrets)
  "*.tfstate",
  "*.tfstate.backup",
];

/**
 * Convert pattern array to comma-separated string for settings
 */
export const DEFAULT_IGNORE_STRING = DEFAULT_IGNORE_PATTERNS.join(", ");

/**
 * Expand a single ignore pattern into glob-style entries that match at any
 * depth, mirroring the "matches anywhere in the path" semantics our web app
 * gets via {@link pathMatches}. Patterns that already carry a path separator
 * are passed through unchanged; bare names get both the file form
 * (`**\/name`) and the directory-contents form (`**\/name/**`) so the same
 * entry covers either interpretation.
 */
export function toGlobIgnore(pattern: string): string[] {
  if (pattern.includes("/")) return [pattern];
  return [`**/${pattern}`, `**/${pattern}/**`];
}

/**
 * Glob-style ignore list derived from {@link DEFAULT_IGNORE_PATTERNS}. Hand
 * this to libraries that take an `ignore` option (`glob`, `fast-glob`) so
 * filesystem walks honour the same defaults the web app applies post-walk.
 */
export const DEFAULT_GLOB_IGNORE = DEFAULT_IGNORE_PATTERNS.flatMap(toGlobIgnore);
