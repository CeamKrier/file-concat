import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
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

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <div className="flex flex-1">
        {/* Mobile sidebar toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full border border-border bg-background shadow-lg md:hidden"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <aside
          className={cn(
            "fixed inset-y-0 left-0 top-14 z-40 w-72 transform border-r border-border/60 bg-background transition-transform duration-200 ease-out-quart md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            "motion-reduce:transition-none",
          )}
        >
          <ScrollArea className="h-full">
            <nav className="px-6 py-10">
              {DOCS_NAVIGATION.map((section) => (
                <div key={section.title} className="mb-9 last:mb-0">
                  <h4 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                    {section.title}
                  </h4>
                  <ul className="space-y-1">
                    {section.links.map((link) => {
                      const isActive = location.pathname === link.href;
                      return (
                        <li key={link.href}>
                          <Link
                            to={link.href}
                            className={cn(
                              "block rounded-sm py-1.5 font-display text-[14px] leading-snug transition-colors duration-150",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              isActive
                                ? "text-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setIsSidebarOpen(false)}
                          >
                            <span className="inline-flex items-center gap-2">
                              {isActive && (
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-1 w-1 rounded-full bg-primary"
                                />
                              )}
                              <span className={cn(!isActive && "pl-3")}>{link.title}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl px-6 py-14 md:px-10 md:py-20">
            <MDXProviderWrapper>{children}</MDXProviderWrapper>
          </div>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
