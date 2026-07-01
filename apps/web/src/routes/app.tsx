import { createFileRoute, redirect } from "@tanstack/react-router";

// The tool now lives on the single-page flow at `/`. Keep `/app` working for
// bookmarks and old links by redirecting it home.
export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
