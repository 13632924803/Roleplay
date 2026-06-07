import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import "./shared/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary label="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
