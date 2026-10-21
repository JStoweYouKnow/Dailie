/**
 * A synced Google calendar is personal. Other people on the board see that the
 * time is taken, not the title, the notes, or the join link. An event that
 * includes more than one person on the team is still one event: everyone on it
 * sees that single copy, and everyone else sees one busy block.
 *
 * Recurring events share an iCal UID across every instance, so the identity of
 * one occurrence is the UID plus when it starts. The same occurrence on two
 * people's calendars collapses; next week's instance stays separate.
 */

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function fnv(text) {
  let h = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Stable id for one occurrence, shared by every calendar that holds it. */
export function googleMeetingId(iCalUID, start, fallbackId) {
  const uid = String(iCalUID || "").trim().toLowerCase();
  if (!uid) return fallbackId;
  return `gcal-${fnv(`${uid}|${Number(start) || 0}`)}`;
}

export function meetingSeriesKey(meeting) {
  const uid = String(meeting && meeting.iCalUID || "").trim().toLowerCase();
  if (!uid) return "";
  const start = Number(meeting.date);
  if (!Number.isFinite(start)) return `uid:${uid}`;
  return `uid:${uid}|${start}`;
}

export function isPersonalSyncedMeeting(meeting) {
  if (!meeting || meeting.visibility === "studio" || meeting.source === "feed") return false;
  if (meeting.busy === true) return true;
  const owned = !!(meeting.syncedBy || (Array.isArray(meeting.participantIds) && meeting.participantIds.length));
  if (!owned) return false;
  const id = typeof meeting.id === "string" ? meeting.id : "";
  return meeting.source === "google" || id.startsWith("gcal-") || id.startsWith("ics-");
}

export function participantIdsFor(meeting, team = []) {
  const ids = new Set();
  if (meeting && meeting.syncedBy) ids.add(meeting.syncedBy);
  for (const id of (meeting && meeting.participantIds) || []) {
    if (id) ids.add(id);
  }
  const emails = new Set(((meeting && meeting.attendeeEmails) || []).map(normalizeEmail).filter(Boolean));
  const organizer = normalizeEmail(meeting && meeting.organizerEmail);
  if (organizer) emails.add(organizer);
  for (const member of team || []) {
    const email = normalizeEmail(member && member.email);
    if (email && emails.has(email) && member.id) ids.add(member.id);
  }
  return [...ids];
}

export function viewerIsIncluded(meeting, viewer, team = []) {
  if (!meeting || !viewer) return false;
  if (viewer.id && participantIdsFor(meeting, team).includes(viewer.id)) return true;
  const email = normalizeEmail(viewer.email);
  if (!email) return false;
  const emails = ((meeting.attendeeEmails) || []).map(normalizeEmail);
  const organizer = normalizeEmail(meeting.organizerEmail);
  if (organizer) emails.push(organizer);
  return emails.includes(email);
}

export function busyLabel(meeting, team = []) {
  const names = participantIdsFor(meeting, team).map((id) => {
    const member = (team || []).find((m) => m.id === id);
    const name = member && member.name ? String(member.name).trim() : "";
    return name ? name.split(/\s+/)[0] : "";
  }).filter(Boolean);
  if (!names.length) return "Busy";
  return `${names.slice(0, 3).join(", ")} · Busy`;
}

function emailList(...groups) {
  const set = new Set();
  for (const group of groups) {
    for (const email of group || []) {
      const norm = normalizeEmail(email);
      if (norm) set.add(norm);
    }
  }
  return [...set];
}

function genericTitle(title) {
  const text = String(title || "").trim();
  return !text || text === "Busy" || text === "(No title)" || /· Busy$/.test(text);
}

function preferredTitle(a, b) {
  if (!genericTitle(a && a.title)) return a.title;
  if (!genericTitle(b && b.title)) return b.title;
  return (a && a.title) || (b && b.title) || "Busy";
}

function richerNotes(a, b) {
  const score = (notes) => {
    const text = String(notes || "").trim();
    if (!text || text === "Synced from Google Calendar") return 0;
    return text.length;
  };
  return score(a && a.notes) >= score(b && b.notes) ? ((a && a.notes) || (b && b.notes) || "") : ((b && b.notes) || "");
}

/** Fold two copies of the same occurrence into the record the board keeps. */
export function mergeMeetingRecords(a, b, team = []) {
  const studio = (a && (a.visibility === "studio" || a.source === "feed"))
    || (b && (b.visibility === "studio" || b.source === "feed"));
  const participantIds = [...new Set([...participantIdsFor(a, team), ...participantIdsFor(b, team)])];
  const base = a || b || {};
  const other = base === a ? (b || {}) : (a || {});
  const merged = {
    ...other,
    ...base,
    id: base.id,
    iCalUID: (base.iCalUID || other.iCalUID || ""),
    title: preferredTitle(other, base),
    date: Number.isFinite(other.date) ? other.date : base.date,
    end: Number.isFinite(other.end) ? other.end : (base.end || null),
    allDay: other.allDay != null ? !!other.allDay : !!base.allDay,
    attendees: base.attendees || other.attendees || "",
    attendeeEmails: emailList(base.attendeeEmails, other.attendeeEmails),
    organizerEmail: normalizeEmail(base.organizerEmail || other.organizerEmail),
    notes: richerNotes(base, other),
    meetingLink: base.meetingLink || other.meetingLink || "",
    followUps: (base.followUps && base.followUps.length) ? base.followUps : (other.followUps || []),
    projectId: base.projectId || other.projectId || null,
    participantIds,
    syncedBy: base.syncedBy || other.syncedBy || participantIds[0] || "",
    showAsFree: !!(base.showAsFree && other.showAsFree),
    busy: false,
  };
  if (studio) {
    merged.visibility = "studio";
    merged.source = (base.source === "feed" || other.source === "feed") ? "feed" : (base.source || other.source || "google");
  } else {
    merged.source = base.source || other.source || "google";
    if (merged.visibility === "studio") delete merged.visibility;
  }
  delete merged.aliasIds;
  return merged;
}

export function collapseMeetings(meetings, team = []) {
  const order = [];
  const byKey = new Map();
  for (const meeting of meetings || []) {
    if (!meeting || !meeting.id) continue;
    const series = meetingSeriesKey(meeting);
    const key = series || `id:${meeting.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, meeting);
      order.push(key);
      continue;
    }
    const prev = byKey.get(key);
    const merged = mergeMeetingRecords(prev, meeting, team);
    merged.id = prev.id;
    byKey.set(key, merged);
  }
  return order.map((key) => byKey.get(key));
}

/**
 * What this viewer is allowed to see. Personal events they are not on come
 * back as a busy block. A free (transparent) hold is omitted for them.
 * `null` means "do not show this".
 */
export function redactMeeting(meeting, viewer, team = []) {
  if (!meeting) return null;
  if (meeting.busy === true) return meeting;
  if (!isPersonalSyncedMeeting(meeting)) return meeting;
  if (viewerIsIncluded(meeting, viewer, team)) return meeting;
  if (meeting.showAsFree) return null;
  const participantIds = participantIdsFor(meeting, team);
  return {
    id: meeting.id,
    iCalUID: meeting.iCalUID || "",
    date: meeting.date,
    end: meeting.end || null,
    allDay: !!meeting.allDay,
    title: busyLabel(meeting, team),
    attendees: "",
    attendeeEmails: [],
    notes: "",
    meetingLink: "",
    followUps: [],
    projectId: null,
    calendarId: "",
    calendarLabel: "",
    source: "google",
    syncedBy: meeting.syncedBy || participantIds[0] || "",
    participantIds,
    showAsFree: false,
    busy: true,
  };
}

/** One chip per day an event covers. All-day ends are exclusive. */
export function meetingDayStarts(meeting) {
  const start = Number(meeting && meeting.date);
  if (!Number.isFinite(start)) return [];
  let end = Number(meeting && meeting.end);
  if (!Number.isFinite(end) || end <= start) end = start + 60 * 1000;
  const lastInstant = meeting.allDay ? end - 1 : end;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(lastInstant);
  last.setHours(0, 0, 0, 0);
  const days = [];
  while (cursor.getTime() <= last.getTime() && days.length < 21) {
    days.push(cursor.getTime() + 12 * 60 * 60 * 1000);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length ? days : [start];
}

export function stampSyncedMeeting(event, { syncedBy = "", team = [], source = "" } = {}) {
  const next = { ...(event || {}) };
  const aliasIds = Array.isArray(next.aliasIds) ? next.aliasIds.filter(Boolean) : [];
  delete next.aliasIds;
  if (source) next.source = source;
  if (next.source === "feed") {
    next.visibility = "studio";
    next.participantIds = participantIdsFor(next, team);
    return { ...next, aliasIds };
  }
  if (syncedBy) {
    next.source = next.source || "google";
    next.syncedBy = syncedBy;
  }
  next.participantIds = participantIdsFor(next, team);
  return { ...next, aliasIds };
}
