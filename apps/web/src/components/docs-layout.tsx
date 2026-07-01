import { Link, useLocation } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import { LogoMark } from "~/components/app/logo-mark";
import { SiteFooter } from "~/components/app/marketing";
import { MDXProviderWrapper } from "~/components/mdx-provider";
import { DOCS_NAVIGATION } from "~/lib/docs-nav";
import { cn } from "~/lib/utils";

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <DocsHeader
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((o) => !o)}
      />

      <div className="mx-auto flex w-full max-w-[1040px] flex-1 gap-8 px-4 sm:px-6 lg:gap-12">
        <aside
          className={cn(
            "bg-background border-border z-modal fixed inset-y-0 left-0 w-72 transform border-r transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
            "md:sticky md:top-[52px] md:z-auto md:h-[calc(100vh-52px)] md:w-[212px] md:shrink-0 md:translate-x-0 md:border-r-0 md:bg-transparent",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            "motion-reduce:transition-none",
          )}
        >
          <ScrollArea className="h-full">
            <nav className="px-6 py-9 md:pl-0 md:pr-6">
              {DOCS_NAVIGATION.map((section) => (
                <div key={section.title} className="mb-8 last:mb-0">
                  <h4 className="text-ink-faint mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em]">
                    {section.title}
                  </h4>
                  <ul className="space-y-0.5">
                    {section.links.map((link) => {
                      const isActive = location.pathname === link.href;
                      return (
                        <li key={link.href}>
                          <Link
                            to={link.href}
                            className={cn(
                              "focus-visible:ring-ring focus-visible:ring-offset-background block rounded-sm py-1.5 text-[14px] leading-snug transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                              isActive ? "text-ink font-medium" : "text-ink-muted hover:text-ink",
                            )}
                            onClick={() => setIsSidebarOpen(false)}
                          >
                            <span className="inline-flex items-center gap-2">
                              {isActive && (
                                <span
                                  aria-hidden="true"
                                  className="bg-primary inline-block h-1.5 w-1.5 rounded-full"
                                />
                              )}
                              <span className={cn(!isActive && "pl-[14px]")}>{link.title}</span>
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
            className="z-modal-backdrop bg-background/80 fixed inset-0 backdrop-blur-sm md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="min-w-0 flex-1 py-10 md:py-14">
          <div className="mx-auto max-w-[720px]">
            <MDXProviderWrapper>{children}</MDXProviderWrapper>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

function DocsHeader({
  isSidebarOpen,
  onToggleSidebar,
}: {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="z-sticky border-hairline sticky top-0 border-b bg-[oklch(var(--background)/0.82)] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[52px] max-w-[1040px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isSidebarOpen}
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background -ml-1.5 inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:hidden"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link
            to="/"
            className="focus-visible:ring-ring focus-visible:ring-offset-background group flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-label="FileConcat home"
          >
            <LogoMark size={26} />
            <span className="font-display text-ink text-[18px] font-semibold tracking-[-0.01em]">
              FileConcat
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1.5">
          <Link
            to="/"
            className="bg-primary text-primary-foreground rounded-input focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Open the tool
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </Link>
          <a
            href="https://github.com/CeamKrier/file-concat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-muted hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-label="Source on GitHub"
          >
            <SiGithub className="h-[15px] w-[15px]" />
          </a>
        </nav>
      </div>
    </header>
  );
}
