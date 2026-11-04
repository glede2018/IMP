import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { installVersionRecovery } from "./services/version-recovery";
import App from "./App";

installVersionRecovery();

/**
 * 应用入口
 * 使用 React 18 createRoot API
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
