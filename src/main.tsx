import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ThemeProvider } from "./components/theme-provider";

import "./index.css";
import App from "./app.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="file-concat-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
