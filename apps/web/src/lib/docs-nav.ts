export interface DocLink {
  title: string;
  href: string;
}

export interface DocSection {
  title: string;
  links: DocLink[];
}

export const DOCS_NAVIGATION: DocSection[] = [
  {
    title: "Getting started",
    links: [
      { title: "Introduction", href: "/docs" },
      { title: "Quick start", href: "/docs/quick-start" },
    ],
  },
  {
    title: "Sources",
    links: [
      { title: "GitHub import", href: "/docs/github-import" },
      { title: "GitLab import", href: "/docs/gitlab-import" },
      { title: "Bitbucket import", href: "/docs/bitbucket-import" },
    ],
  },
  {
    title: "Reference",
    links: [
      { title: "File filtering", href: "/docs/file-filtering" },
      { title: "Filter precedence", href: "/docs/filter-precedence" },
      { title: "Token estimation", href: "/docs/token-estimation" },
      { title: "Token costs", href: "/docs/token-costs" },
      { title: "Configuration", href: "/docs/configuration" },
      { title: "CLI usage", href: "/docs/cli-usage" },
    ],
  },
];
