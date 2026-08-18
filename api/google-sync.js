import { createClerkClient } from "@clerk/backend";

/**
 * Pulls Gmail and Google Calendar straight from the signed-in user's Workspace
 * account, replacing the copy-and-paste import.
 *
 * The Google token never reaches the browser: this route verifies the Clerk session,
 * exchanges it for the user's Google OAuth token server-side, calls Google, and
 * returns records already in the board's shape.
 *
 * Requires Clerk's Google connection to use *custom* credentials with the Gmail and
 * Calendar scopes — Clerk's shared development credentials are limited to
 * openid/email/profile and cannot be widened.
 */
const GMAIL = "https://gmail.googleapis.com/gmail/v1";
const CALENDAR = "https://www.googleapis.com/calendar/v3";

const NEEDED = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
};

const MAX_MESSAGES = 50;
const MAX_EVENTS = 100;

function fail(message, status = 400, extra = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

async function googleToken(clerk, userId) {
  let tokens;
  try {
    const res = await clerk.users.getUserOauthAccessToken(userId, "google");
    tokens = Array.isArray(res) ? res : res && res.data;
  } catch (err) {
    return { error: "Could not read your Google connection from Clerk." };
  }
  const entry = (tokens || [])[0];
  if (!entry || !entry.token) {
    return { error: "No Google account is connected. Sign in with Google, or connect it from your account settings." };
  }
  return { token: entry.token, scopes: entry.scopes || [] };
}

function hasScope(scopes, needed) {
  return (scopes || []).some((s) => s === needed || s.endsWith(needed.split("/").pop()));
}

async function googleGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body && body.error && body.error.message;
    const err = new Error(reason || `Google returned ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function headerValue(headers, name) {
  const hit = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit ? hit.value : "";
}

function parseAddresses(raw) {
  return String(raw || "")
    .split(",")
    .map((chunk) => {
      const angle = chunk.match(/<([^>]+)>/);
      return (angle ? angle[1] : chunk).trim().toLowerCase();
    })
    .filter((a) => a.includes("@"));
}

/** Gmail messages, flattened into the shape the Emails tab already stores. */
async function syncGmail(token, account) {
  const list = await googleGet(
    `${GMAIL}/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent("in:anywhere -in:spam -in:trash newer_than:60d")}`,
    token
  );
  const ids = (list.messages || []).map((m) => m.id);

  const messages = await Promise.all(
    ids.map(async (id) => {
      try {
        const m = await googleGet(
          `${GMAIL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
          token
        );
        const headers = (m.payload && m.payload.headers) || [];
        const from = parseAddresses(headerValue(headers, "From"))[0] || "";
        const to = parseAddresses([headerValue(headers, "To"), headerValue(headers, "Cc")].filter(Boolean).join(","));
        const sentAt = Number(m.internalDate) || Date.parse(headerValue(headers, "Date")) || Date.now();
        const outgoing = account && from === account.toLowerCase();
        return {
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

function attendeeLine(event) {
  const people = (event.attendees || [])
    .map((a) => a.displayName || a.email)
    .filter(Boolean);
  if (people.length) return people.join(", ").slice(0, 180);
  const organiser = event.organizer && (event.organizer.displayName || event.organizer.email);
  return organiser || "Google Calendar";
}

function meetingLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = (event.conferenceData && event.conferenceData.entryPoints) || [];
  const video = entry.find((e) => e.entryPointType === "video");
  if (video && video.uri) return video.uri;
  const text = `${event.location || ""}\n${event.description || ""}`;
  const meet = text.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meet) return meet[0];
  const zoom = text.match(/https?:\/\/[\w.-]*zoom\.us\/(?:j|w|s|my)\/\S+/i);
  return zoom ? zoom[0].replace(/[.,;)\]]+$/, "") : "";
}

/** Calendar events, in the shape the Calendar and Meetings tabs already store. */
async function syncCalendar(token) {
  const timeMin = new Date(Date.now() - 30 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 120 * 86400000).toISOString();
  const data = await googleGet(
    `${CALENDAR}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${MAX_EVENTS}` +
      `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    token
  );

  return (data.items || [])
    .filter((e) => e.status !== "cancelled" && e.summary)
    .map((e) => {
      // All-day events carry a bare date. Parsing that as-is lands on UTC midnight,
      // which reads as the previous day anywhere west of Greenwich — so pin it to
      // midday, the same convention the board's own date fields use.
      const timed = e.start && e.start.dateTime;
      const allDay = e.start && e.start.date;
      const date = timed
        ? new Date(timed).getTime()
        : allDay
          ? new Date(`${allDay}T12:00:00`).getTime()
          : Date.now();
      const where = e.location ? `Where: ${e.location}` : "";
      return {
        // Stable across syncs, so a repeated pull updates rather than duplicates.
        id: `gcal-${e.id}`,
        title: e.summary,
        date,
        attendees: attendeeLine(e),
        notes: [where, e.description].filter(Boolean).join("\n\n").slice(0, 2000) || "Synced from Google Calendar",
        meetingLink: meetingLink(e),
        followUps: [],
        projectId: null,
      };
    });
}

export async function POST(request) {
  if (!process.env.CLERK_SECRET_KEY) {
    return fail("Authentication is not configured on the server.", 501);
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  let auth;
  try {
    const state = await clerk.authenticateRequest(request);
    auth = state.toAuth();
  } catch (err) {
    return fail("Could not verify your session.", 401);
  }
  if (!auth || !auth.userId) return fail("You are not signed in.", 401);

  let body = {};
  try {
    body = await request.json();
  } catch (err) { /* defaults below */ }
  const what = body.what === "gmail" ? "gmail" : "calendar";

  const { token, scopes, error } = await googleToken(clerk, auth.userId);
  if (error) return fail(error, 400, { needsConnection: true });

  if (!hasScope(scopes, NEEDED[what])) {
    return fail(
      `Your Google connection is missing the ${what === "gmail" ? "Gmail" : "Calendar"} permission. ` +
        "Clerk's shared Google credentials only grant sign-in — add your own Google OAuth client with " +
        `the ${NEEDED[what]} scope to enable syncing.`,
      403,
      { missingScope: NEEDED[what], grantedScopes: scopes }
    );
  }

  try {
    if (what === "gmail") {
      const emails = await syncGmail(token, body.account || "");
      return Response.json({ what, emails, count: emails.length });
    }
    const meetings = await syncCalendar(token);
    return Response.json({ what, meetings, count: meetings.length });
  } catch (err) {
    const status = err.status === 401 || err.status === 403 ? 403 : 502;
    return fail(err.message || "Google refused the request.", status);
  }
}
