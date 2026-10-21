import {
  GOOGLE_SCOPES,
  gmailMessages,
  googleGet,
  googleTokenForUser,
  hasScope,
} from "../lib/googleWorkspace.js";
import { requireBoardMember } from "../lib/requireApiAuth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { mapGoogleEvent } from "../lib/googleCalendarEvents.js";

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
 *
 * The Google half lives in ../lib/googleWorkspace.js, shared with the scheduled sync
 * in convex/gmail.ts so both read a mailbox exactly the same way.
 */
const CALENDAR = "https://www.googleapis.com/calendar/v3";

const MAX_EVENTS = 100;

function fail(message, status = 400, extra = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

async function listCalendars(token) {
  try {
    const data = await googleGet(`${CALENDAR}/users/me/calendarList?maxResults=50`, token);
    const items = (data.items || []).filter((c) => c.id && c.selected !== false);
    if (items.length) return items;
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
  }
  return [{ id: "primary", summary: "Primary", primary: true }];
}

async function eventsForCalendar(token, calendar, timeMin, timeMax) {
  const data = await googleGet(
    `${CALENDAR}/calendars/${encodeURIComponent(calendar.id)}/events?singleEvents=true&orderBy=startTime&maxResults=${MAX_EVENTS}` +
      `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    token
  );
  return (data.items || [])
    .map((e) => mapGoogleEvent(e, calendar))
    .filter(Boolean);
}

/** Calendar events, in the shape the Calendar and Meetings tabs already store. */
async function syncCalendar(token, excludedCalendarIds) {
  const timeMin = new Date(Date.now() - 30 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 120 * 86400000).toISOString();
  const calendars = await listCalendars(token);
  const skip = new Set(excludedCalendarIds || []);
  const pages = await Promise.all(
    calendars.map(async (calendar) => {
      if (skip.has(calendar.id)) return [];
      try {
        return await eventsForCalendar(token, calendar, timeMin, timeMax);
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw err;
        return [];
      }
    })
  );
  const seen = new Set();
  const meetings = pages.flat().filter((m) => {
    const key = m.iCalUID ? `${m.iCalUID}|${m.date}` : m.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    meetings,
    calendars: calendars.map((c) => ({
      id: c.id,
      summary: c.summary || c.id,
      primary: !!c.primary,
    })),
  };
}

export async function POST(request) {
  const gate = await requireBoardMember(request);
  if (gate.error) return gate.error;
  const auth = gate.auth;
  const limited = await rateLimit({
    bucket: "google-sync",
    key: `google-sync:${auth.userId}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
    request,
  });
  if (limited.error) return limited.error;

  let body = {};
  try {
    body = await request.json();
  } catch (err) { /* defaults below */ }
  const what = body.what === "gmail" ? "gmail" : "calendar";

  const { token, scopes, error, needsReauth, needsConnection } = await googleTokenForUser(auth.userId, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
  if (error) {
    return fail(error, needsReauth ? 403 : 400, {
      needsConnection: !!needsConnection,
      needsReauth: !!needsReauth,
      missingScope: needsReauth ? GOOGLE_SCOPES[what] : undefined,
    });
  }

  // Empty scopes means Clerk did not tell us — try Google and reauth only if it refuses.
  if (scopes.length && !hasScope(scopes, GOOGLE_SCOPES[what])) {
    return fail(
      `Google has not granted ${what === "gmail" ? "Gmail" : "Calendar"} access yet. ` +
        "You will be asked to allow it, then sync runs again.",
      403,
      { missingScope: GOOGLE_SCOPES[what], grantedScopes: scopes, needsReauth: true }
    );
  }

  try {
    if (what === "gmail") {
      const emails = await gmailMessages(token, body.account || "");
      return Response.json({ what, emails, count: emails.length });
    }
    const pulled = await syncCalendar(token, Array.isArray(body.excludedCalendarIds) ? body.excludedCalendarIds : []);
    return Response.json({
      what,
      meetings: pulled.meetings,
      count: pulled.meetings.length,
      calendars: pulled.calendars,
    });
  } catch (err) {
    const googleAuthFail = err.status === 401 || err.status === 403;
    const apiDisabled = /has not been used in project|is disabled|accessNotConfigured/i.test(err.message || "");
    if (apiDisabled) {
      return fail(
        "The Google Calendar API is not enabled on the OAuth client that Clerk uses. Enable it in Google Cloud Console, then reconnect Google.",
        403
      );
    }
    return fail(
      err.message || "Google refused the request.",
      googleAuthFail ? 403 : 502,
      googleAuthFail ? { needsReauth: true, missingScope: GOOGLE_SCOPES[what] } : {}
    );
  }
}
