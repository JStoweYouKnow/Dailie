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
const DRIVE = "https://www.googleapis.com/drive/v3";
const MEET = "https://meet.googleapis.com/v2";
const CLERK_API = "https://api.clerk.com/v1";

export const GOOGLE_SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  meet: "https://www.googleapis.com/auth/meetings.space.readonly",
};

/** A meeting artifact is a Google Doc, and its title says which kind it is. */
const NOTE_TITLE_HINTS = ["Notes by Gemini", "Transcript"];
const GOOGLE_DOC = "application/vnd.google-apps.document";

// Docs get edited after the fact; a very long one is almost never a meeting note.
const MAX_NOTE_CHARS = 40000;

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

async function googleGetText(url, token, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = new Error(`Google returned ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res.text();
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

/* ------------------------------------------------------------------ *
 * Drive — meeting notes shared in from someone else's Workspace
 *
 * When another organisation hosts the call, its transcript and notes belong to that
 * organisation, and the Meet API will not hand them over. What does arrive is the
 * artifact itself, shared into the attendee's Drive. Reading it there needs no
 * Workspace edition of our own.
 * ------------------------------------------------------------------ */

/** @param {number} [since] */
export function driveNotesQuery(since) {
  const named = NOTE_TITLE_HINTS.map((hint) => `name contains '${hint}'`).join(" or ");
  const clauses = [
    "sharedWithMe = true",
    `mimeType = '${GOOGLE_DOC}'`,
    "trashed = false",
    `(${named})`,
  ];
  if (since) clauses.push(`modifiedTime > '${new Date(since - WINDOW_OVERLAP_MS).toISOString()}'`);
  return clauses.join(" and ");
}

/**
 * Splits "Weekly sync - 2026/04/15 16:55 CDT - Notes by Gemini" into the meeting's
 * own name and when it happened. The zone abbreviation is not portable, so a title
 * that will not parse leaves the caller to fall back on the file's own timestamps.
 *
 * @param {string} name
 * @returns {{ title: string, startedAt: number | null, kind: string }}
 */
export function parseMeetingNoteTitle(name) {
  const raw = String(name || "").trim();
  const kind = /transcript/i.test(raw) ? "transcript" : "notes";

  const parts = raw.split(" - ");
  let startedAt = null;
  let title = raw;

  if (parts.length >= 2) {
    // The trailing "Notes by Gemini" / "Transcript" marker is not part of the name.
    const tail = parts[parts.length - 1];
    const withoutMarker = NOTE_TITLE_HINTS.some((hint) => tail.includes(hint))
      ? parts.slice(0, -1)
      : parts;

    const maybeDate = withoutMarker[withoutMarker.length - 1];
    if (withoutMarker.length >= 2 && /\d{4}[/-]\d{2}[/-]\d{2}/.test(maybeDate)) {
      const parsed = Date.parse(maybeDate.replace(/\//g, "-").replace(/\s+[A-Z]{2,5}$/, "Z"));
      if (!Number.isNaN(parsed)) startedAt = parsed;
      title = withoutMarker.slice(0, -1).join(" - ").trim();
    } else {
      title = withoutMarker.join(" - ").trim();
    }
  }

  return { title: title || raw, startedAt, kind };
}

/**
 * Meeting notes and transcripts shared into this account since the last run.
 *
 * @param {string} token
 * @param {{ since?: number, max?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function driveMeetingNotes(token, { since, max = 25, fetchImpl = fetch } = {}) {
  const fields = "files(id,name,createdTime,modifiedTime,owners(emailAddress,displayName),webViewLink)";
  const url =
    `${DRIVE}/files?q=${encodeURIComponent(driveNotesQuery(since))}` +
    `&fields=${encodeURIComponent(fields)}&pageSize=${max}&orderBy=modifiedTime desc`;

  const data = await googleGet(url, token, fetchImpl);
  return (data.files || []).map((f) => {
    const owner = (f.owners || [])[0] || {};
    const parsed = parseMeetingNoteTitle(f.name);
    return {
      id: f.id,
      name: f.name || "",
      title: parsed.title,
      kind: parsed.kind,
      startedAt: parsed.startedAt || Date.parse(f.createdTime) || Date.now(),
      modifiedAt: Date.parse(f.modifiedTime) || 0,
      ownerEmail: String(owner.emailAddress || "").toLowerCase(),
      ownerName: owner.displayName || "",
      webViewLink: f.webViewLink || "",
    };
  });
}

/**
 * A shared Doc as plain text.
 *
 * @param {string} token
 * @param {string} fileId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function driveDocText(token, fileId, { fetchImpl = fetch } = {}) {
  const text = await googleGetText(
    `${DRIVE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
    token,
    fetchImpl
  );
  return String(text || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_NOTE_CHARS);
}

/* ------------------------------------------------------------------ *
 * Meet — conferences our own organisation hosted
 *
 * Transcript entries arrive already attributed and already timed, so this route needs
 * neither transcription nor the speaker-guessing pass: the work is joining entries to
 * the participants who spoke them, and the conference to the meeting on the board.
 *
 * Entries are deleted 30 days after the conference, which is the real deadline on
 * this route — a sync left broken for a month loses that month for good.
 * ------------------------------------------------------------------ */

const MEET_ENTRY_PAGES = 20;

/** @param {number} [since] */
export function meetRecordsFilter(since) {
  const from = new Date((since || Date.now() - 7 * 86400000) - WINDOW_OVERLAP_MS).toISOString();
  return `start_time>="${from}"`;
}

/**
 * Conferences that ended since the last run.
 *
 * @param {string} token
 * @param {{ since?: number, max?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function meetConferences(token, { since, max = 25, fetchImpl = fetch } = {}) {
  const url = `${MEET}/conferenceRecords?filter=${encodeURIComponent(meetRecordsFilter(since))}&pageSize=${max}`;
  const data = await googleGet(url, token, fetchImpl);
  return (data.conferenceRecords || [])
    // A conference still running has no transcript to collect yet.
    .filter((c) => c.name && c.endTime)
    .map((c) => ({
      name: c.name,
      id: String(c.name).split("/").pop(),
      space: c.space || "",
      startedAt: Date.parse(c.startTime) || 0,
      endedAt: Date.parse(c.endTime) || 0,
    }));
}

/**
 * The join code for a conference's space, which is how a conference is matched to a
 * meeting already on the board.
 *
 * Returns "" rather than throwing: a space belonging to another organisation is not
 * readable, and that is an unlinked call rather than a failed run.
 *
 * @param {string} token
 * @param {string} spaceName
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function meetSpaceCode(token, spaceName, { fetchImpl = fetch } = {}) {
  if (!spaceName) return "";
  try {
    const space = await googleGet(`${MEET}/${spaceName}`, token, fetchImpl);
    return String(space.meetingCode || "").trim();
  } catch (err) {
    return "";
  }
}

/**
 * @param {string} token
 * @param {string} conferenceName
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function meetTranscripts(token, conferenceName, { fetchImpl = fetch } = {}) {
  const data = await googleGet(`${MEET}/${conferenceName}/transcripts?pageSize=5`, token, fetchImpl);
  return (data.transcripts || []).filter((t) => t.name);
}

/**
 * Every entry of one transcript, in order.
 *
 * @param {string} token
 * @param {string} transcriptName
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function meetTranscriptEntries(token, transcriptName, { fetchImpl = fetch } = {}) {
  const entries = [];
  let pageToken = "";
  for (let page = 0; page < MEET_ENTRY_PAGES; page++) {
    const url =
      `${MEET}/${transcriptName}/entries?pageSize=100` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const data = await googleGet(url, token, fetchImpl);
    entries.push(...(data.transcriptEntries || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return entries;
}

/**
 * @param {string} token
 * @param {string} participantName
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function meetParticipantName(token, participantName, { fetchImpl = fetch } = {}) {
  if (!participantName) return "";
  try {
    const p = await googleGet(`${MEET}/${participantName}`, token, fetchImpl);
    return String(
      (p.signedinUser && p.signedinUser.displayName) ||
        (p.anonymousUser && p.anonymousUser.displayName) ||
        (p.phoneUser && p.phoneUser.displayName) ||
        ""
    ).trim();
  } catch (err) {
    return "";
  }
}

/**
 * Transcript entries in the shape the call detail view already renders — seconds from
 * the start of the conference rather than wall-clock timestamps.
 *
 * @param {Array<{participant?: string, text?: string, startTime?: string, endTime?: string}>} entries
 * @param {number} conferenceStart
 * @param {(participant: string) => string} [speakerFor]
 */
export function entriesToSegments(entries, conferenceStart, speakerFor = () => "") {
  const offset = (stamp, fallback) => {
    const at = Date.parse(String(stamp || ""));
    if (Number.isNaN(at)) return fallback;
    return Math.max(0, Math.round(((at - conferenceStart) / 1000) * 100) / 100);
  };

  return (entries || [])
    .map((entry) => {
      const start = offset(entry.startTime, 0);
      return {
        start,
        end: offset(entry.endTime, start),
        text: String(entry.text || "").trim(),
        speaker: speakerFor(String(entry.participant || "")) || "",
      };
    })
    .filter((segment) => segment.text);
}

/** The transcript as text, which is what a summary is written from. */
export function segmentsToTranscript(segments) {
  return (segments || [])
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join("\n");
}
