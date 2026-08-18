/**
 * Client half of the Google Workspace sync. The Google token stays on the server —
 * this posts to /api/google-sync, which verifies the Clerk session, exchanges it for
 * the user's Google token and returns records already in the board's shape.
 */
export async function syncFromGoogle(what, { account } = {}) {
  let res;
  try {
    res = await fetch("/api/google-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ what, account }),
    });
  } catch (err) {
    throw new Error("Could not reach the sync endpoint. Run the app with `vercel dev` to serve /api locally.");
  }

  // A dev server answers 200 with the app's HTML; that is not a sync result.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("No sync endpoint is available here. Deploy, or run `vercel dev`.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Sync failed (${res.status}).`);
    error.missingScope = body.missingScope;
    error.needsConnection = body.needsConnection;
    throw error;
  }
  return body;
}

/** True when Google sync could work at all — it needs a signed-in session. */
export function googleSyncAvailable(authEnabled) {
  return !!authEnabled;
}
