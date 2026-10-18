import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { initializeWorkspaceNavigation } from "@/app/navigation";
import { PreferencesProvider, initializePreferences } from "@/shared/i18n/preferences";

import "./styles.css";

initializePreferences();
const stopNavigation = initializeWorkspaceNavigation();
if (import.meta.hot) import.meta.hot.dispose(stopNavigation);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
);
