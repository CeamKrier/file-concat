import bundleSizes from "~/data/repo-funnel-values.json";

/**
 * FAQ for /how-to/github-repo-to-text. Rendered on the page and emitted as
 * FAQPage JSON-LD from the route, so it lives in its own module.
 *
 * The repository sizes are derived from `~/data/repo-funnel-values.json`, the
 * 60 public repositories bundled on 2026-09-11 for
 * /blog/how-many-tokens-is-a-codebase, never typed in. "About a fifth" and the
 * format spread are that post's and /blog/xml-vs-markdown-for-llm-context's
 * published findings. Import behaviour is from /docs/github-import and the
 * GitHub adapter in packages/core.
 */
const sorted = [...bundleSizes].sort((a, b) => a - b);
const mid = sorted.length / 2;

export const REPO_SAMPLE = {
  count: sorted.length,
  median: sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2,
  largest: sorted[sorted.length - 1],
  fits: (window: number) => sorted.filter((v) => v <= window).length,
};

const num = (v: number) => Math.round(v).toLocaleString("en-US");

export const GITHUB_REPO_FAQ = [
  {
    q: "How do I convert a GitHub repo to a text file?",
    a: "Paste the repository URL at the top of this page and press Fetch. Your browser downloads the files straight from GitHub, leaves out lock files, dependencies, build output and test files by default, and hands back one text file with the file tree at the top and every file under its path. Copy it or download it.",
  },
  {
    q: "How many tokens is a GitHub repository?",
    a: `It varies more than any average suggests. We bundled ${REPO_SAMPLE.count} public repositories in 10 languages on 2026-09-11: the median came to ${num(REPO_SAMPLE.median)} tokens, ${REPO_SAMPLE.fits(128_000)} of ${REPO_SAMPLE.count} fit a 128K context window, and the largest reached ${num(REPO_SAMPLE.largest)}. FileConcat counts yours before you paste it.`,
  },
  {
    q: "Can I convert a private repository?",
    a: "Not by link. The import reads public repositories, with no GitHub account. Clone the repository and drop the folder on this page instead; it is read in your browser the same way.",
  },
  {
    q: "Can I import one folder or one branch?",
    a: "Yes. Add /tree/branch to the URL for a branch, and /tree/branch/path for a single folder, and only the files under that path come in. A branch name with a slash in it does not work, so import the default branch instead.",
  },
  {
    q: "What does it leave out by default?",
    a: "The .git folder, dependency and vendored directories, lock files such as package-lock.json and go.sum, build output such as dist and target, and test files named as tests, such as api.test.ts or handler_test.go. Any of it can go back in under Adjust what's included. On our fresh clones the defaults removed about a fifth of the tokens, most of it tests.",
  },
  {
    q: "Markdown or XML for a codebase?",
    a: "FileConcat writes XML, Markdown or plain text, switched under the preview. Across five real codebases the switch changed the total by 0.24% to 1.13% of tokens (our measurement, August 2026), so use the one your prompt already uses.",
  },
  {
    q: "Does a large repository work?",
    a: "Yes. When GitHub's file listing for a repository comes back incomplete, FileConcat downloads the whole repository as one archive instead and unpacks it in your browser. Without an account, GitHub limits how often one address can call its API, so many imports in a short time can be refused; the message says when to try again.",
  },
  {
    q: "Is my code uploaded to a server?",
    a: "Not to us. Your browser fetches the files directly from GitHub, so that request goes to them, and the bundle is built in your tab. There is no account to create.",
  },
];
