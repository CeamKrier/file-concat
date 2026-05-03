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

/**
 * Generate JSON-LD structured data for WebApplication
 */
export function generateWebApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FileConcat",
    description:
      "Free, offline tool to combine multiple files into a single document optimized for AI assistants like ChatGPT, Claude, and Gemini.",
    url: BASE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "100% Offline Processing",
      "GitHub Repository Import",
      "GitLab Repository Import",
      "Token Estimation",
      "Multiple Output Formats",
      "File Filtering with Glob Patterns",
    ],
    screenshot: `${BASE_URL}/screenshot.png`,
    softwareHelp: {
      "@type": "CreativeWork",
      url: `${BASE_URL}/docs`,
    },
    author: {
      "@type": "Person",
      name: "CeamKrier",
      url: "https://twitter.com/CeamKrier",
    },
  };
}

/**
 * Generate JSON-LD structured data for HowTo
 */
export function generateHowToSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Combine Files for AI Assistants",
    description:
      "Learn how to use FileConcat to combine multiple files into a single document optimized for ChatGPT, Claude, and other AI assistants.",
    step: [
      {
        "@type": "HowToStep",
        name: "Upload Files",
        text: "Drag and drop your files or folders, or import from a GitHub/GitLab repository.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: "Configure Filters",
        text: "Use glob patterns to include or exclude specific files. Choose from presets for popular tech stacks.",
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: "Review and Edit",
        text: "Preview file contents, toggle individual files, and make edits if needed.",
        position: 3,
      },
      {
        "@type": "HowToStep",
        name: "Export",
        text: "Copy to clipboard or download as a single file or multiple chunks for large projects.",
        position: 4,
      },
      {
        "@type": "HowToStep",
        name: "Share with AI",
        text: "Paste the optimized output into ChatGPT, Claude, or your preferred AI assistant.",
        position: 5,
      },
    ],
    tool: {
      "@type": "HowToTool",
      name: "FileConcat",
    },
  };
}
