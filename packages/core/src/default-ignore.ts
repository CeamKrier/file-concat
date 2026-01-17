
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
];

/**
 * Convert pattern array to comma-separated string for settings
 */
export const DEFAULT_IGNORE_STRING = DEFAULT_IGNORE_PATTERNS.join(", ");
