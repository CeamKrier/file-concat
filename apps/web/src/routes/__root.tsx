import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "~/components/theme-provider";
import { StagedFilesProvider } from "~/components/staged-files-provider";
import { NotFound } from "~/components/not-found";
import { ErrorBoundary } from "~/components/error-boundary";
import { generateHowToSchema, generateWebApplicationSchema } from "~/lib/seo";
import "~/styles/app.css";

export const Route = createRootRoute({
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error, reset }) => <ErrorBoundary error={error} reset={reset} />,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/logo.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(generateWebApplicationSchema()),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(generateHowToSchema()),
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('ui-theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <ThemeProvider defaultTheme="system" storageKey="ui-theme">
          <StagedFilesProvider>
            <Outlet />
          </StagedFilesProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
