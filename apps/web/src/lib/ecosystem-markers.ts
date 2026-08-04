/**
 * The published ecosystem marker list (ADR-0014).
 *
 * A **Marker file** (see `CONTEXT.md`) is a file whose *name* is on this fixed
 * list and identifies the ecosystem a drop came from. Only membership in the
 * list is ever recorded, never a name from outside it, which is what lets the
 * counters answer "which ecosystem is using this" without carrying a single
 * user-authored file name.
 *
 * The list is the whole safety property, so it is data and nothing else: adding
 * an entry is a deliberate edit, and a name that is not here produces no counter
 * rather than a partial or hashed one.
 */

/**
 * Exact filenames, lowercased. Every entry must survive the counter's value
 * pattern (`^[a-z0-9._/+-]{1,32}$`), which is what the recorded value is.
 */
const MARKER_FILENAMES: ReadonlySet<string> = new Set([
  // JavaScript / TypeScript
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb",
  "deno.json",
  "tsconfig.json",
  // Python
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "pipfile",
  "environment.yml",
  // Go, Rust
  "go.mod",
  "cargo.toml",
  // JVM
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  // Ruby, PHP
  "gemfile",
  "rakefile",
  "composer.json",
  // Apple, Dart, Elixir
  "package.swift",
  "podfile",
  "cartfile",
  "pubspec.yaml",
  "mix.exs",
  // R
  "renv.lock",
  // Infrastructure and CI
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "chart.yaml",
  "jenkinsfile",
  ".gitlab-ci.yml",
  "makefile",
  "cmakelists.txt",
]);

/**
 * Suffixes whose *filename* is user-authored (`MyCompany.Internal.csproj`), so
 * the suffix token alone is recorded. Never the name that carried it.
 */
const MARKER_SUFFIXES: readonly string[] = [
  ".csproj",
  ".fsproj",
  ".vbproj",
  ".sln",
  ".gemspec",
  ".cabal",
  ".podspec",
];

/**
 * The marker this path represents, or null. The return value is always a member
 * of the published list — for a suffix match it is the suffix token without its
 * dot, never the file's own name.
 */
export function markerFor(path: string): string | null {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  if (MARKER_FILENAMES.has(name)) return name;

  for (const suffix of MARKER_SUFFIXES) {
    // `name.length > suffix.length` so a file *called* `.sln` is not reported as
    // a project file; the marker is the suffix of a longer name.
    if (name.length > suffix.length && name.endsWith(suffix)) return suffix.slice(1);
  }
  return null;
}
