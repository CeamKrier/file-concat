/**
 * The category map the codebase study (`measure-repo-funnel.ts`) classifies
 * paths with, extracted so the tool comparison classifies a competitor's bundle
 * with the very same rules rather than a second opinion.
 *
 * Ours, and a judgment call rather than a standard. Nothing in a repository
 * says a path is source or test or generated. Print it with
 * `measure-funnel --rules` and publish it in the article's method section.
 * The rules are path-based, so they apply to any tool's path set unchanged.
 *
 * Revised 2026-09-10 after the tool comparison read `bun.lock` as source,
 * `Tests/` as source, `3rdparty/` as source and every SVG as source. The
 * codebase study's published composition was measured before this revision;
 * the analyzers recompute the category from the path, so a rule fix reaches
 * an existing artifact without a rerun.
 */

export type Category =
  | "source"
  | "tests"
  | "docs"
  | "config"
  | "assets"
  | "lockfiles"
  | "generated"
  | "vendored";

export const CATEGORIES: Category[] = [
  "source",
  "tests",
  "docs",
  "config",
  "assets",
  "lockfiles",
  "generated",
  "vendored",
];

/**
 * Ordered, first match wins. The order is the argument: a vendored test
 * is vendored, and a lockfile is a lockfile before it is JSON config.
 */
export const CATEGORY_RULES: { category: Category; why: string; match: (p: string) => boolean }[] = [
  {
    category: "vendored",
    why: "a directory that holds somebody else's code",
    match: (p) => hasSegment(p, VENDOR_DIRS),
  },
  {
    category: "lockfiles",
    why: "a resolved dependency graph, by exact file name",
    match: (p) => LOCKFILES.has(base(p)),
  },
  {
    category: "generated",
    why: "build output or a generator's file, by directory or suffix",
    match: (p) => hasSegment(p, GENERATED_DIRS) || GENERATED_SUFFIX.test(base(p)),
  },
  {
    category: "tests",
    why: "a test directory, or a name a test runner recognises",
    match: (p) => hasSegment(p, TEST_DIRS) || TEST_NAME.test(base(p)),
  },
  {
    category: "assets",
    why: "an image in a text encoding, by extension",
    match: (p) => ASSET_EXT.test(base(p)),
  },
  {
    category: "docs",
    why: "prose, by extension or by directory",
    match: (p) => DOC_EXT.test(base(p)) || hasSegment(p, DOC_DIRS),
  },
  {
    category: "config",
    why: "settings rather than behaviour, by extension or by known name",
    match: (p) => CONFIG_EXT.test(base(p)) || CONFIG_NAMES.has(base(p)) || base(p).startsWith("."),
  },
  { category: "source", why: "everything the other rules did not claim", match: () => true },
];

/** Directory names are matched case-insensitively: `Tests/` and `tests/` are one convention. */
const VENDOR_DIRS = new Set([
  "vendor",
  "vendors",
  "third_party",
  "third-party",
  "thirdparty",
  "3rdparty",
  "node_modules",
  "external",
  "pods",
  ".yarn",
]);
const GENERATED_DIRS = new Set([
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  "coverage",
  "generated",
  "__generated__",
  "__snapshots__",
]);
const TEST_DIRS = new Set([
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "__mocks__",
  "e2e",
  "fixtures",
  "testdata",
]);
const DOC_DIRS = new Set(["doc", "docs", "documentation"]);
const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "deno.lock",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "Gemfile.lock",
  "composer.lock",
  "Pipfile.lock",
  "pubspec.lock",
  "mix.lock",
  "packages.lock.json",
  "gradle.lockfile",
  "go.sum",
  "flake.lock",
  "Podfile.lock",
  "Package.resolved",
]);
const CONFIG_NAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Rakefile",
  "Procfile",
  "Justfile",
  "CMakeLists.txt",
]);
const GENERATED_SUFFIX = /(\.min\.(js|css)|\.map|\.pb(\.\w+)?\.go|_pb2\.py|\.g\.dart|\.generated\.\w+|\.snap)$/;
const TEST_NAME = /(^test_|[._-](test|spec)\.\w+$|Tests?\.\w+$)/;
const ASSET_EXT = /\.svg$/i;
const DOC_EXT = /\.(md|mdx|rst|adoc|txt)$/i;
const CONFIG_EXT = /\.(json|ya?ml|toml|ini|cfg|conf|properties|env)$/i;

export const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const hasSegment = (p: string, set: Set<string>) =>
  p
    .split("/")
    .slice(0, -1)
    .some((s) => set.has(s.toLowerCase()));

export function categorize(relPath: string): Category {
  for (const rule of CATEGORY_RULES) if (rule.match(relPath)) return rule.category;
  return "source";
}

/**
 * What the product's `dot: false` walk never sees: any path with a segment that
 * starts with a dot. The same test the funnel's `hidden` attribution rests on,
 * applied to a competitor's path so the two can be compared.
 */
export const isHidden = (p: string) => p.split("/").some((s) => s.startsWith("."));
