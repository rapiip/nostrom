import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted type, the same three weights previously loaded from Google
// Fonts. Each file declares every unicode subset with a unicode-range, so the
// browser only downloads the subsets a page actually uses.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import { App } from "./App";
import "./styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
