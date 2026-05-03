import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Home, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { MDXProviderWrapper } from "~/components/mdx-provider";
import { cn } from "~/lib/utils";

interface DocLink {
  title: string;
  href: string;
}

interface DocSection {
  title: string;
  links: DocLink[];
}

const DOCS_NAVIGATION: DocSection[] = [
  {
    title: "Getting Started",
    links: [
      { title: "Introduction", href: "/docs" },
      { title: "Quick Start", href: "/docs/quick-start" },
    ],
  },
  {
    title: "Features",
    links: [
      { title: "File Filtering", href: "/docs/file-filtering" },
      { title: "GitHub Import", href: "/docs/github-import" },
      { title: "GitLab Import", href: "/docs/gitlab-import" },
      { title: "Token Estimation", href: "/docs/token-estimation" },
    ],
  },
  {
    title: "Advanced",
    links: [
      { title: "CLI Usage", href: "/docs/cli-usage" },
      { title: "Configuration", href: "/docs/configuration" },
    ],
  },
];

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <aside
        className={cn(
          "bg-background fixed inset-y-0 left-0 z-40 w-64 transform border-r transition-transform duration-200 md:relative md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Home className="h-4 w-4" />
            FileConcat
          </Link>
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <nav className="p-4">
            {DOCS_NAVIGATION.map((section) => (
              <div key={section.title} className="mb-6">
                <h4 className="text-muted-foreground mb-2 text-sm font-semibold">
                  {section.title}
                </h4>
                <ul className="space-y-1">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        to={link.href}
                        className={cn(
                          "hover:bg-accent flex items-center rounded-md px-2 py-1.5 text-sm",
                          location.pathname === link.href && "bg-accent font-medium",
                        )}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <ChevronRight className="mr-1 h-3 w-3" />
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
          <MDXProviderWrapper>{children}</MDXProviderWrapper>
        </div>
      </main>
    </div>
  );
}
