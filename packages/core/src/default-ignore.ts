
export const DEFAULT_IGNORE_PATTERNS = [
  // Version control
  ".git",
  ".hg",
  ".svn",

  // Dependency directories
  "node_modules",
  "bower_components",
  "vendor",
  // Vendored code under the other names it travels by. Measured 2026-09-10 over
  // the same 60 repositories: one of them, KDE's ghostwriter, kept 9,374,207
  // tokens in our bundle against gitingest's 2,843,609, and 90.4% of ours sat
  // under `3rdparty/`.
  "3rdparty",
  "third_party",
  "thirdparty",

  // Lock files
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  // Bun 1.2 writes a text lockfile under this name. Measured 2026-09-10 over the
  // same 60 repositories: five of them carried one and it reached our bundle in
  // every case, 303,092 tokens in the largest, while Repomix and gitingest
  // dropped it.
  "bun.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "poetry.lock",
  "uv.lock",
  "Podfile.lock",
  "mix.lock",
  "flake.lock",
  "pubspec.lock",
  "packages.lock.json",
  // go.sum is a checksum database, not a manifest. go.mod stays: it is the
  // dependency list a reader wants. Measured 2026-09-07 over 60 public
  // repositories: it was the only lockfile still reaching a bundle, and four Go
  // repositories carried 886,586 tokens of it, 789,477 of them in one.
  "go.sum",
  "Pipfile.lock",
  "gradle.lockfile",

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

  // Test files, by the naming convention each ecosystem actually uses. Matched
  // on the file name at any depth, never on a directory name: the list used to
  // carry `__tests__` alone, so a project that grouped tests in a folder lost
  // all of them and a project that named them by suffix kept all of them.
  //
  // Two deliberate limits. Extensions are spelled out rather than left as
  // `*.test.*`, so a `schema.test.json` fixture is not swept up by a pattern
  // aimed at source. And nothing here matches a directory, so `tests/helpers.ts`
  // and Rust's `tests/*.rs` integration files survive, as does any suite that
  // does not follow its ecosystem's convention. This removes the part of a
  // suite that is named for what it is, not every test in a repository.
  //
  // suffix before the extension: api.test.ts, api.spec.js
  "*.test.js",
  "*.test.jsx",
  "*.test.mjs",
  "*.test.cjs",
  "*.test.ts",
  "*.test.tsx",
  "*.spec.js",
  "*.spec.jsx",
  "*.spec.mjs",
  "*.spec.cjs",
  "*.spec.ts",
  "*.spec.tsx",
  // underscore suffix: handler_test.go, parser_spec.rb
  "*_test.go",
  "*_test.py",
  "*_test.rb",
  "*_test.rs",
  "*_test.cc",
  "*_test.cpp",
  "*_spec.rb",
  // prefix: test_parser.py, plus pytest's own fixture module
  "test_*.py",
  "conftest.py",
  // CamelCase suffix: UserServiceTest.java, ParserTests.swift
  "*Test.java",
  "*Tests.java",
  "*Test.kt",
  "*Tests.kt",
  "*Test.scala",
  "*Test.cs",
  "*Tests.cs",
  "*Test.php",
  "*Tests.swift",

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
  ".eggs",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".ipynb_checkpoints",

  // JVM / Android / Gradle
  ".gradle",
  ".mvn",

  // Ruby
  ".bundle",

  // iOS / Swift / Xcode
  "Pods",
  "Carthage",
  "DerivedData",
  "xcuserdata",

  // Dart / Flutter
  ".dart_tool",

  // Godot. Sidecars and caches only: `.uid` and `.import` are per-asset
  // metadata the editor regenerates, and a single project brings hundreds of
  // them. `.tscn` and `.tres` are deliberately absent — scenes and resources
  // are the project's actual content, and a Godot developer asking about their
  // game wants them in the bundle.
  ".godot",
  ".import",
  "*.uid",
  "*.import",

  // Terraform / IaC
  ".terraform",

  // Elixir / Erlang / Haskell
  "_build",
  ".stack-work",
  "dist-newstyle",

  // More JS/TS framework output
  ".svelte-kit",
  ".astro",
  ".angular",
  ".docusaurus",
  ".pnp.js",
  ".pnp.cjs",

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
