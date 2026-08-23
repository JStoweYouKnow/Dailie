/**
 * Google Workspace access, shared by the browser-triggered sync route
 * (`api/google-sync.js`) and the scheduled one that runs inside Convex
 * (`convex/gmail.ts`).
 *
 * Nothing here imports an SDK — the Clerk token exchange is a plain REST call — so
 * the same module loads in a Vercel function and in Convex's default runtime, and
 * the two paths cannot drift into reading mail two different ways.
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1";
const CLERK_API = "https://api.clerk.com/v1";

export const GOOGLE_SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
};

export const GMAIL_MAX_MESSAGES = 50;

// Clerk has used both provider ids over the years; try each rather than failing closed.
const GOOGLE_PROVIDERS = ["oauth_google", "google"];

// A message that lands while a sync is running would fall between two `after:`
// windows. Overlapping them costs a few already-stored ids and closes that gap.
const WINDOW_OVERLAP_MS = 10 * 60 * 1000;

export function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  if (typeof scopes === "string") return scopes.split(/[\s,]+/).filter(Boolean);
  return [];
}

export function hasScope(scopes, needed) {
  const needle = needed.split("/").pop();
  return normalizeScopes(scopes).some((s) => s === needed || s.endsWith(needle));
}

/**
 * The user's Google token, straight from Clerk's backend API.
 *
 * Takes a Clerk *user id* rather than a request: nothing about this needs a live
 * browser session, which is what lets the scheduled sync run while everyone is
 * logged out. Returns an `error` shape rather than throwing so both callers can
 * turn "not connected" and "reconnect needed" into their own kind of message.
 *
 * @param {string} userId
 * @param {{ secretKey?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ token?: string, scopes?: string[], error?: string, needsReauth?: boolean, needsConnection?: boolean }>}
 */
export async function googleTokenForUser(userId, { secretKey, fetchImpl = fetch } = {}) {
  let sawUnprocessable = false;

  for (const provider of GOOGLE_PROVIDERS) {
    let res;
    try {
      res = await fetchImpl(`${CLERK_API}/users/${encodeURIComponent(userId)}/oauth_access_tokens/${provider}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
    } catch (err) {
      return { error: `Could not reach Clerk to read the Google token: ${(err && err.message) || err}` };
    }

    // Clerk answers 422 when the connection exists but its token cannot be refreshed.
    if (res.status === 422) { sawUnprocessable = true; continue; }
    if (!res.ok) continue;

    const body = await res.json().catch(() => null);
    // The endpoint has returned both a bare array and a paginated envelope.
    const tokens = Array.isArray(body) ? body : (body && body.data) || [];
    const entry = tokens[0];
    if (entry && entry.token) {
      return { token: entry.token, scopes: normalizeScopes(entry.scopes) };
    }
  }

  if (sawUnprocessable) {
    return {
      error: "Google needs you to reconnect so the token can be refreshed.",
      needsReauth: true,
    };
  }
  return {
    error: "No Google account is connected. Sign in with Google, or connect it from your account settings.",
    needsConnection: true,
  };
}

export async function googleGet(url, token, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body && body.error && body.error.message;
    const err = new Error(reason || `Google returned ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function headerValue(headers, name) {
  const hit = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit ? hit.value : "";
}

export function parseAddresses(raw) {
  return String(raw || "")
    .split(",")
    .map((chunk) => {
      const angle = chunk.match(/<([^>]+)>/);
      return (angle ? angle[1] : chunk).trim().toLowerCase();
    })
    .filter((a) => a.includes("@"));
}

/**
 * The search a sync run asks Gmail for. Without a previous run there is no window to
 * continue from, so it falls back to the same 60 days the manual sync has always read.
 */
/** @param {number} [since] */
export function gmailQuery(since) {
  const base = "in:anywhere -in:spam -in:trash";
  if (!since) return `${base} newer_than:60d`;
  const from = Math.floor(Math.max(0, since - WINDOW_OVERLAP_MS) / 1000);
  return `${base} after:${from}`;
}

/**
 * Gmail messages, flattened into the shape the Emails tab already stores.
 *
 * @param {string} token
 * @param {string} account
 * @param {{ since?: number, max?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function gmailMessages(token, account, { since, max = GMAIL_MAX_MESSAGES, fetchImpl = fetch } = {}) {
  const list = await googleGet(
    `${GMAIL}/users/me/messages?maxResults=${max}&q=${encodeURIComponent(gmailQuery(since))}`,
    token,
    fetchImpl
  );
  const ids = (list.messages || []).map((m) => m.id);

  const messages = await Promise.all(
    ids.map(async (id) => {
      try {
        const m = await googleGet(
          `${GMAIL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
          token,
          fetchImpl
        );
        const headers = (m.payload && m.payload.headers) || [];
        const from = parseAddresses(headerValue(headers, "From"))[0] || "";
        const to = parseAddresses([headerValue(headers, "To"), headerValue(headers, "Cc")].filter(Boolean).join(","));
        const sentAt = Number(m.internalDate) || Date.parse(headerValue(headers, "Date")) || Date.now();
        const outgoing = account && from === account.toLowerCase();
        return {
          // Stable across runs: the same message imported twice keeps one id, which
          // is what lets the scheduled sync skip what it has already stored.
          id: `gmail-${m.id}`,
          direction: outgoing ? "out" : "in",
          account: account || "",
          from,
          fromName: (headerValue(headers, "From").match(/^\s*"?([^"<]+?)"?\s*</) || [])[1] || "",
          to,
          subject: headerValue(headers, "Subject") || "(no subject)",
          body: "",
          snippet: m.snippet || "",
          sentAt,
          status: outgoing ? "Sent" : "Received",
          openCount: 0,
          lastOpened: null,
          threadId: m.threadId || "",
          personId: null,
          companyId: null,
          projectId: null,
          imported: true,
        };
      } catch (err) {
        return null;
      }
    })
  );

  return messages.filter(Boolean);
}
