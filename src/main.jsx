import "./instrument.js";
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import { SharedProvider } from "./lib/convexBoard.jsx";
import "./index.css";

function SentryFallback({ error, resetError }) {
  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      padding: 32, background: "var(--bg, #141a17)", color: "var(--bone, #f0f3ee)",
    }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div className="md-display" style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          Something went wrong
        </div>
        <p style={{ fontSize: 13, color: "var(--dim, #9aaba1)", lineHeight: 1.45, marginBottom: 16 }}>
          {error?.message || "The board hit an unexpected error. You can try again without losing this device’s copy."}
        </p>
        <button className="md-btn" type="button" onClick={resetError}>Try again</button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <Sentry.ErrorBoundary fallback={SentryFallback}>
    <React.StrictMode>
      <AuthProvider>
        <SharedProvider>
          <App />
        </SharedProvider>
      </AuthProvider>
    </React.StrictMode>
  </Sentry.ErrorBoundary>
);
