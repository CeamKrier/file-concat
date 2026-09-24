import { createFileRoute, redirect } from "@tanstack/react-router";

// The page moved on 2026-09-24, its first day live, so the slug names Repomix
// as the title and H1 do. 301, not the router's default 307: the move is
// permanent and a temporary redirect leaves both URLs in the index.
export const Route = createFileRoute("/how-to/gitingest-alternative")({
  beforeLoad: () => {
    throw redirect({ to: "/how-to/gitingest-repomix-alternative", statusCode: 301 });
  },
});
