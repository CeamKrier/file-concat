export const generateArticleSchema = () => {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Free File Concatenation Tool for AI Assistants - FileConcat",
    description:
      "Learn how to use FileConcat, the free online tool for combining multiple files into AI-optimized formats for ChatGPT, Claude, Gemini, and other large language models.",
    image: "https://fileconcat.com/opengraph.png",
    datePublished: "2024-01-01T00:00:00Z",
    dateModified: "2025-07-09T00:00:00Z",
    author: {
      "@type": "Organization",
      name: "FileConcat Team",
    },
    publisher: {
      "@type": "Organization",
      name: "FileConcat",
      logo: {
        "@type": "ImageObject",
        url: "https://fileconcat.com/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": "https://fileconcat.com/",
    },
    articleSection: "Technology",
    keywords: [
      "file concatenation",
      "AI tools",
      "ChatGPT",
      "Claude",
      "LLM",
      "developer tools",
      "code sharing",
    ],
    inLanguage: "en-US",
  };
};

export const generateHowToSchema = () => {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Combine Files for AI Assistants",
    description:
      "Step-by-step guide on using FileConcat to prepare multiple files for AI language models like ChatGPT and Claude.",
    image: "https://fileconcat.com/opengraph.png",
    totalTime: "PT2M",
    estimatedCost: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: "0",
    },
    supply: [
      {
        "@type": "HowToSupply",
        name: "Files to combine",
      },
      {
        "@type": "HowToSupply",
        name: "Web browser",
      },
    ],
    tool: [
      {
        "@type": "HowToTool",
        name: "FileConcat Web Application",
      },
    ],
    step: [
      {
        "@type": "HowToStep",
        name: "Upload Files",
        text: "Drag and drop your files or folders into the FileConcat interface, or import directly from a GitHub repository.",
        image: "https://fileconcat.com/step1.png",
      },
      {
        "@type": "HowToStep",
        name: "Review and Select",
        text: "Review the detected files and select which ones to include in your concatenated output.",
        image: "https://fileconcat.com/step2.png",
      },
      {
        "@type": "HowToStep",
        name: "Choose Output Format",
        text: "Select between single file output or multi-file chunks based on your AI model's context limits.",
        image: "https://fileconcat.com/step3.png",
      },
      {
        "@type": "HowToStep",
        name: "Download Results",
        text: "Download your optimized files ready for use with ChatGPT, Claude, or any other AI assistant.",
        image: "https://fileconcat.com/step4.png",
      },
    ],
  };
};

export const generateFAQSchema = () => {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is FileConcat free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, FileConcat is completely free to use with no registration required, no file size limits, and no hidden fees.",
        },
      },
      {
        "@type": "Question",
        name: "How secure is FileConcat?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FileConcat is 100% secure. All file processing happens locally in your browser, and your files never leave your device or get uploaded to any server.",
        },
      },
      {
        "@type": "Question",
        name: "What AI models does FileConcat support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FileConcat supports all major AI models including GPT-4, GPT-4 Turbo, Claude 3 (Haiku, Sonnet, Opus), Google Gemini, Llama 3, and many others with automatic token counting and context optimization.",
        },
      },
      {
        "@type": "Question",
        name: "Can I use FileConcat for large projects?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! FileConcat includes smart chunking that automatically splits large projects into appropriately sized files for different AI models' context limits.",
        },
      },
      {
        "@type": "Question",
        name: "What file types are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FileConcat supports all common file types including code files (JS, TS, Python, Java, C++, etc.), documentation (Markdown, TXT), configuration files (JSON, YAML), and many more.",
        },
      },
    ],
  };
};
