import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
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
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
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
    <html lang="en" className="dark">
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
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
