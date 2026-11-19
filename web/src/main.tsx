import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installExternalLinkHandler } from "./lib/externalLinks";
import "./index.css";

installExternalLinkHandler();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
