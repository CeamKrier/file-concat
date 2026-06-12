interface SEOConfig {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

const BASE_URL = "https://fileconcat.com";
const DEFAULT_IMAGE = `${BASE_URL}/opengraph.png`;
const SITE_NAME = "FileConcat";
const TWITTER_HANDLE = "@CeamKrier";

/**
 * Generate meta tags for SEO
 */
export function generateSEOMeta(config: SEOConfig) {
  const {
    title,
    description,
    url = BASE_URL,
    image = DEFAULT_IMAGE,
    type = "website",
    publishedTime,
    modifiedTime,
    author,
  } = config;

  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  const meta = [
    // Basic
    { title: fullTitle },
    { name: "description", content: description },

    // Open Graph
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:site", content: TWITTER_HANDLE },
    { name: "twitter:creator", content: TWITTER_HANDLE },
  ];

  // Article-specific meta
  if (type === "article") {
    if (publishedTime) {
      meta.push({ property: "article:published_time", content: publishedTime });
    }
    if (modifiedTime) {
      meta.push({ property: "article:modified_time", content: modifiedTime });
    }
    if (author) {
      meta.push({ property: "article:author", content: author });
    }
  }

  return meta;
}

const AUTHOR = {
  "@type": "Person" as const,
  name: "CeamKrier",
  url: "https://twitter.com/CeamKrier",
};

const CLI_NPM_URL = "https://www.npmjs.com/package/@fileconcat/cli";
const REPO_URL = "https://github.com/CeamKrier/file-concat";

/**
 * Generate JSON-LD structured data for the web tool at fileconcat.com.
 * Emitted from `__root.tsx` so every page carries the site-level schema.
 */
export function generateWebApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FileConcat",
    description:
      "Privacy-first tool that turns a folder into one structured file for AI assistants. Runs entirely in the browser at fileconcat.com, or as the @fileconcat/cli npm package in the terminal. Supports token estimation, glob filtering, GitHub / GitLab / Bitbucket import, and PDF / DOCX / XLSX / PPTX / ODF text extraction.",
    url: BASE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any modern browser",
    browserRequirements: "Requires a browser with the File System Access API or drag-and-drop.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Runs in the browser, no upload, no account",
      "Token estimation for 200+ LLM models (OpenAI, Anthropic, Google, and others)",
      "Glob include / ignore patterns with live preview",
      "Public GitHub, GitLab, and Bitbucket repository import",
      "XML and Markdown output formats",
      "Multi-file output chunking by size",
      "Companion npm CLI @fileconcat/cli with the same engine",
    ],
    softwareHelp: {
      "@type": "CreativeWork",
      url: `${BASE_URL}/docs`,
    },
    sameAs: [REPO_URL, CLI_NPM_URL],
    author: AUTHOR,
  };
}

/**
 * Generate JSON-LD structured data for the published CLI.
 * Separate from the WebApplication entry so the npm artifact gets its own
 * SERP signal.
 */
export function generateCLISoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "@fileconcat/cli",
    alternateName: "file-concat",
    description:
      "Commander.js CLI that runs the same @fileconcat/core engine as fileconcat.com. Streams the bundle to stdout, progress to stderr, and a one-line JSON summary under --json. Opt-in PDF / DOCX / XLSX / PPTX / ODF parsing via --parse.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Linux, macOS, Windows",
    downloadUrl: CLI_NPM_URL,
    softwareRequirements: "Node.js >= 18",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    softwareHelp: {
      "@type": "CreativeWork",
      url: `${BASE_URL}/docs/cli-usage`,
    },
    codeRepository: REPO_URL,
    author: AUTHOR,
  };
}

/**
 * Generate JSON-LD structured data for HowTo.
 * Note: Google deprecated the HowTo rich result for non-cooking sites in
 * 2023, so this is no longer a SERP boost. It stays as a knowledge-graph
 * description of what the tool does.
 */
export function generateHowToSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to combine files for AI assistants",
    description:
      "How to use FileConcat to turn a folder of files into a single structured bundle for ChatGPT, Claude, Gemini, or any other long-context assistant.",
    step: [
      {
        "@type": "HowToStep",
        name: "Bring in your files",
        text: "Drop a folder in the browser at fileconcat.com, paste a public GitHub / GitLab / Bitbucket URL, or run `pnpm dlx @fileconcat/cli ./folder` from the terminal.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: "Filter the tree",
        text: "Use glob patterns in the include / ignore textareas, or pick a preset chip for a popular stack. The file tree updates live as you type.",
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: "Review the selection",
        text: "Inspect the file tree, preview contents, and toggle individual files on or off. The token counter tracks the running cost.",
        position: 3,
      },
      {
        "@type": "HowToStep",
        name: "Export",
        text: "Copy the bundle to your clipboard or download it as a single file. Large projects can be split into multiple chunks by size.",
        position: 4,
      },
      {
        "@type": "HowToStep",
        name: "Send it to the model",
        text: "Paste the bundle into ChatGPT, Claude, Gemini, or pipe stdout from the CLI directly into an assistant of your choice.",
        position: 5,
      },
    ],
    tool: {
      "@type": "HowToTool",
      name: "FileConcat",
    },
  };
}
