import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? "production" : import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA
      ? `dailie@${import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA}`
      : `dailie@${import.meta.env.VITE_APP_VERSION || "1.0.0"}`,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/.*\.convex\.cloud/,
      /^https:\/\/www\.thewizardofops\.app/,
    ],
  });
}
