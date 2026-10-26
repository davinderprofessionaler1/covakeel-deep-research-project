import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { BrandingProvider } from "./Branding.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrandingProvider><App /></BrandingProvider>
  </StrictMode>,
);
