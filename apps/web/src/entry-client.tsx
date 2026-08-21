import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { installErrorCounter } from "~/lib/js-errors";

// Before hydration, not inside a component: a stale chunk fails while the tree
// is being built, and a listener attached in an effect would miss exactly that.
installErrorCounter();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
