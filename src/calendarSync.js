/**
 * Utility for parsing iCal (.ics) feeds and Gmail / Google Calendar invites into Dailie format
 */

function unfoldICS(icsData) {
  return String(icsData || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function icsProperty(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const parts = left.split(";");
  const name = parts[0].toUpperCase();
  const params = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, value: line.slice(colon + 1), params };
}

function contactFromICS(prop) {
  const email = String(prop.value || "").replace(/^mailto:/i, "").trim();
  const cn = (prop.params && prop.params.CN) || "";
  if (cn && email) return `${cn} (${email})`;
  return cn || email || "";
}

export function parseICSFeed(icsData) {
  const events = [];
  const lines = unfoldICS(icsData).split(/\r\n|\n|\r/);
  let currentEvent = null;
  let attendees = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const prop = icsProperty(line);

    if (line === "BEGIN:VEVENT") {
      currentEvent = { id: "ics-" + Math.random().toString(36).slice(2, 9), followUps: [] };
      attendees = [];
    } else if (line === "END:VEVENT") {
      if (currentEvent && currentEvent.title) {
        if (currentEvent.uid) currentEvent.id = `ics-${currentEvent.uid}`;
        if (!Number.isFinite(currentEvent.date)) currentEvent.date = Date.now();
        if (!currentEvent.meetingLink) {
          currentEvent.meetingLink = extractMeetingLink(`${currentEvent.location || ""}\n${currentEvent.notes || ""}`);
        }
        if (attendees.length) currentEvent.attendees = attendees.join(", ").slice(0, 180);
        events.push(currentEvent);
      }
      currentEvent = null;
      attendees = [];
    } else if (currentEvent && prop) {
      if (prop.name === "SUMMARY") {
        currentEvent.title = unescapeICS(prop.value).trim();
      } else if (prop.name === "DESCRIPTION") {
        currentEvent.notes = unescapeICS(prop.value).trim();
      } else if (prop.name === "LOCATION") {
        currentEvent.location = unescapeICS(prop.value).trim();
      } else if (prop.name === "DTSTART") {
        currentEvent.date = parseICSDate(prop.value);
      } else if (prop.name === "UID") {
        // Stable across re-syncs, so a repeated pull updates events instead of duplicating them.
        currentEvent.uid = String(prop.value || "").trim();
      } else if (prop.name === "X-GOOGLE-CONFERENCE") {
        currentEvent.meetingLink = unescapeICS(prop.value).trim();
      } else if (prop.name === "ORGANIZER" || prop.name === "ATTENDEE") {
        const person = contactFromICS(prop);
        if (person && !attendees.includes(person)) attendees.push(person);
      }
    }
  }

  return events;
}

function unescapeICS(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseICSDate(dtStr) {
  try {
    const clean = dtStr.replace(/[^0-9T]/g, "");
    if (clean.length >= 8) {
      const year = parseInt(clean.slice(0, 4), 10);
      const month = parseInt(clean.slice(4, 6), 10) - 1;
      const day = parseInt(clean.slice(6, 8), 10);
      let hour = 12, min = 0;
      if (clean.length >= 13) {
        hour = parseInt(clean.slice(9, 11), 10);
        min = parseInt(clean.slice(11, 13), 10);
      }
      if (String(dtStr).endsWith("Z")) {
        return new Date(Date.UTC(year, month, day, hour, min)).getTime();
      }
      return new Date(year, month, day, hour, min).getTime();
    }
  } catch (e) {}
  return Date.now();
}

function stripHtml(raw) {
  let text = String(raw || "");
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  }
  return text.replace(/\u00a0/g, " ");
}

function parseLooseDate(raw) {
  let s = String(raw || "")
    .replace(/⋅/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  s = s.replace(/\s+-\s+\d{1,2}.+$/, "");
  s = s.replace(/\s+to\s+\d{1,2}.+$/i, "");
  s = s.replace(/(\d{1,2}:\d{2})\s*([ap]m)/i, (_, time, ap) => `${time} ${ap.toUpperCase()}`);
  s = s.replace(/(\d{1,2})\s*([ap]m)/i, (_, hour, ap) => `${hour}:00 ${ap.toUpperCase()}`);

  const attempts = [s, s.replace(/^[A-Za-z]+,?\s+/, "")];
  for (const attempt of attempts) {
    const ts = Date.parse(attempt);
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
}

function extractInviteTitle(text) {
  const subject = text.match(/^Subject:\s*(.+)$/im);
  let raw = subject ? subject[1].trim() : "";
  if (!raw) {
    const inv = text.match(/^\s*(?:Updated |Canceled |Cancelled |Accepted )?(?:Invitation|Invite):\s*(.+)$/im);
    if (inv) raw = inv[1].trim();
  }
  raw = raw.replace(/^(Updated |Canceled |Cancelled |Accepted )?(Invitation|Invite):\s*/i, "");
  raw = raw.replace(/\s+@\s+.+$/, "").trim();
  return raw || "Gmail Meeting";
}

function extractInviteDate(text) {
  const candidates = [];
  const whenLine = text.match(/When:\s*(.+)/i);
  if (whenLine) candidates.push(whenLine[1]);
  const whenBlock = text.match(/\bWhen\b\s*\n\s*(.+)/i);
  if (whenBlock) candidates.push(whenBlock[1]);
  const invitationAt = text.match(/(?:Invitation|Invite):[^@\n]+@\s*(.+)/i);
  if (invitationAt) candidates.push(invitationAt[1]);
  const dateHdr = text.match(/^Date:\s*(.+)$/im);
  if (dateHdr) candidates.push(dateHdr[1]);

  for (const candidate of candidates) {
    const ts = parseLooseDate(candidate);
    if (ts) return ts;
  }
  return Date.now();
}

function extractAttendees(text) {
  const people = [];
  const headerRe = /^(From|To|Cc|Bcc):\s*(.+)$/gim;
  let match;
  while ((match = headerRe.exec(text))) {
    people.push(match[2].trim());
  }

  const guestsIdx = text.search(/^Guests\s*$/im);
  if (guestsIdx !== -1) {
    const after = text.slice(guestsIdx).split(/\n/).slice(1, 10);
    for (const line of after) {
      const trimmed = line.trim();
      if (!trimmed) break;
      if (/^(When|Where|Notes|Join|Yes|No|Maybe|Going|Invitation)/i.test(trimmed)) break;
      people.push(trimmed.replace(/\s+[-–].+$/, "").trim());
    }
  }

  const unique = [...new Set(people.filter(Boolean))];
  return unique.join(", ").slice(0, 180) || "Gmail Contacts";
}

export function extractMeetingLink(text) {
  const source = String(text || "");
  const meet = source.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meet) return meet[0];
  const zoom = source.match(/https?:\/\/[\w.-]*zoom\.us\/(?:j|w|s|my)\/\S+/i);
  if (zoom) return zoom[0].replace(/[.,;)\]]+$/, "");
  return "";
}

function extractLocation(text) {
  const where = text.match(/Where:\s*(.+)/i);
  if (where) return where[1].trim();
  return extractMeetingLink(text);
}

function dateKeyFromTs(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseGmailTextInvite(rawEmailText) {
  const text = stripHtml(rawEmailText).replace(/\r\n/g, "\n").trim();
  const title = extractInviteTitle(text);
  const date = extractInviteDate(text);
  const attendees = extractAttendees(text);
  const location = extractLocation(text);
  const meetingLink = extractMeetingLink(text);
  const notes = [location && `Where: ${location}`, text].filter(Boolean).join("\n\n").slice(0, 2000);

  return {
    id: "gmail-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    date,
    attendees,
    notes,
    meetingLink,
    followUps: [
      {
        id: "f-" + Math.random().toString(36).slice(2, 8),
        text: location ? `Join / confirm: ${location}` : "Review synced Gmail notes",
        owner: "Producer",
        dueDate: dateKeyFromTs(date),
        done: false,
      },
    ],
  };
}

/**
 * True only for a real iCal document. A feed fetch that lands on an SPA fallback, an
 * error page or a login redirect returns 200 with HTML — parsing that as an invite
 * would manufacture a meeting out of markup.
 */
export function isICalendarFeed(text) {
  return /BEGIN:VCALENDAR/i.test(String(text || ""));
}

export function looksLikeCalendarPayload(text) {
  const t = String(text || "").trim();
  if (t.length < 12) return false;
  if (/BEGIN:(VEVENT|VCALENDAR)/i.test(t)) return true;
  if (/^Subject:/im.test(t)) return true;
  if (/(Invitation|Invite):/i.test(t)) return true;
  if (/^When:/im.test(t) || /^Guests\s*$/im.test(t)) return true;
  if (/calendar\.google\.com|meet\.google\.com/i.test(t)) return true;
  if (/^From:/im.test(t) && (/^To:/im.test(t) || /^Date:/im.test(t))) return true;
  return /(@|meeting|invite|zoom)/i.test(t) && t.length > 40;
}

function meetingFromICSEvent(event) {
  const notes = [event.location && `Where: ${event.location}`, event.notes].filter(Boolean).join("\n\n") || "Synced from Google Calendar";
  return {
    id: event.id,
    title: event.title,
    date: Number.isFinite(event.date) ? event.date : Date.now(),
    attendees: event.attendees || "Google Calendar Sync",
    notes,
    meetingLink: event.meetingLink || "",
    followUps: event.followUps && event.followUps.length ? event.followUps : [],
  };
}

export function parseSyncPayload(raw) {
  const text = stripHtml(raw).replace(/\r\n/g, "\n").trim();
  if (!text) return { kind: "empty", meetings: [] };

  if (/BEGIN:(VEVENT|VCALENDAR)/i.test(text)) {
    const meetings = parseICSFeed(text).map(meetingFromICSEvent);
    return { kind: "calendar", meetings };
  }

  return { kind: "gmail", meetings: [parseGmailTextInvite(text)] };
}
