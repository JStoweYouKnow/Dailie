/**
 * Client half of the Google Workspace sync. The Google token stays on the server —
 * this posts to /api/google-sync, which verifies the Clerk session, exchanges it for
 * the user's Google OAuth token and returns records already in the board's shape.
 */

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_CALENDAR_RESUME_KEY = "dailie.googleCalendarResume";

let resumeStarted = false;

function scopeList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") return raw.split(/[\s,]+/).filter(Boolean);
  return [];
}

export function googleExternalAccount(user) {
  if (!user || !Array.isArray(user.externalAccounts)) return null;
  return user.externalAccounts.find((a) => a.provider === "google" || a.provider === "oauth_google") || null;
}

export function googleHasScope(user, needed) {
  const account = googleExternalAccount(user);
  if (!account) return false;
  const needle = needed.split("/").pop();
  return scopeList(account.approvedScopes).some((s) => s === needed || s.endsWith(needle));
}

export function shouldResumeGoogleCalendarSync() {
  if (resumeStarted) return false;
  try {
    return sessionStorage.getItem(GOOGLE_CALENDAR_RESUME_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function markGoogleCalendarResumeStarted() {
  resumeStarted = true;
}

export function clearGoogleCalendarResume() {
  resumeStarted = false;
  try { sessionStorage.removeItem(GOOGLE_CALENDAR_RESUME_KEY); } catch (err) { /* private mode */ }
}

/**
 * Asks Google for Calendar (or other) scopes on the already-connected account.
 * Redirects the browser when Google needs a fresh consent screen.
 */
export async function requestGoogleAccess(user, additionalScopes, { redirectUrl, force } = {}) {
  const account = googleExternalAccount(user);
  if (!account) {
    throw new Error("No Google account is connected. Sign in with Google, then try again.");
  }
  if (!force && additionalScopes.every((s) => googleHasScope(user, s))) {
    return { alreadyGranted: true };
  }

  try {
    sessionStorage.setItem(GOOGLE_CALENDAR_RESUME_KEY, "1");
  } catch (err) { /* private mode */ }

  let result;
  try {
    result = await account.reauthorize({
      additionalScopes,
      redirectUrl: redirectUrl || `${window.location.origin}${window.location.pathname}`,
      oidcPrompt: "consent",
    });
  } catch (err) {
    clearGoogleCalendarResume();
    const msg = (err && err.message) || "";
    if (/scope|custom credential|not (been )?enabled/i.test(msg)) {
      throw new Error(
        "Google sign-in cannot request Calendar access until Clerk's Google connection uses your own OAuth client with the Calendar API enabled. Then reconnect Google once."
      );
    }
    throw err;
  }

  const url =
    (result && result.verification && result.verification.externalVerificationRedirectURL) ||
    (account.verification && account.verification.externalVerificationRedirectURL);
  if (url) {
    window.location.assign(String(url));
    return { redirecting: true };
  }
  return { alreadyGranted: true };
}

export async function syncFromGoogle(what, { account, getToken, excludedCalendarIds } = {}) {
  // Explicit bearer token — see useAuthToken for why the cookie is not enough.
  let token = "";
  if (typeof getToken === "function") {
    try { token = (await getToken()) || ""; } catch (err) { /* falls back to the cookie */ }
  }

  let res;
  try {
    res = await fetch("/api/google-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ what, account, excludedCalendarIds }),
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
    error.needsReauth = body.needsReauth;
    throw error;
  }
  return body;
}

/** True when Google sync could work at all — it needs a signed-in session. */
export function googleSyncAvailable(authEnabled) {
  return !!authEnabled;
}
