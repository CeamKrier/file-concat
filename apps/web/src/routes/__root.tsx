import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import { ThemeProvider } from "~/components/theme-provider";
import { StagedFilesProvider } from "~/components/staged-files-provider";
import { NotFound } from "~/components/not-found";
import { ErrorBoundary } from "~/components/error-boundary";
import {
  generateCLISoftwareApplicationSchema,
  generateHowToSchema,
  generateWebApplicationSchema,
} from "~/lib/seo";
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
        children: JSON.stringify(generateCLISoftwareApplicationSchema()),
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
            __html: `(function(c,l,a,r,i,t,y){
                      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                    })(window, document, "clarity", "script", "pg1fkmu3nn");`,
          }}
        ></script>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var style = document.createElement('style');
                style.setAttribute('data-theme-init', '');
                style.appendChild(document.createTextNode('*,*::before,*::after{transition-duration:0s !important;transition-delay:0s !important;animation-duration:0s !important;animation-delay:0s !important;}'));
                document.head.appendChild(style);
                try {
                  var theme = localStorage.getItem('ui-theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
                function unlock() {
                  requestAnimationFrame(function() {
                    requestAnimationFrame(function() { style.remove(); });
                  });
                }
                if (document.readyState === 'complete') unlock();
                else window.addEventListener('load', unlock, { once: true });
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
