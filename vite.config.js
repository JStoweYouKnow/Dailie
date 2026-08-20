import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { microfrontends } from "@vercel/microfrontends/experimental/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryRelease = process.env.VERCEL_GIT_COMMIT_SHA
  ? `dailie@${process.env.VERCEL_GIT_COMMIT_SHA}`
  : undefined;

export default defineConfig({
  build: { sourcemap: "hidden" },
  define: {
    "import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA": JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ""),
  },
  plugins: [
    react(),
    microfrontends(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG || "matriarch-studios",
      project: process.env.SENTRY_PROJECT || "javascript-react",
      authToken: sentryAuthToken,
      disable: !sentryAuthToken,
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
      release: { name: sentryRelease },
      errorHandler: (err) => {
        console.error("Sentry source map upload failed:", err);
        throw err;
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
  },
});
