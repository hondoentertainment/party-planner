import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { ConfirmProvider } from "./lib/useConfirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EssentialCookiesBanner } from "./components/EssentialCookiesBanner";
import { PlausibleLoader } from "./components/PlausibleLoader";
import { initSentry, installGlobalErrorHandlers } from "./lib/sentry";
import { App } from "./App";
import "./index.css";

initSentry();
installGlobalErrorHandlers();

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ConfirmProvider>
              <EssentialCookiesBanner />
              <PlausibleLoader />
              <App />
            </ConfirmProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
