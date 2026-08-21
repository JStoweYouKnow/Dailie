/**
 * Meetings pulled from Google (OAuth or an iCal feed) can be hidden so they stay
 * off the board and are skipped on the next sync. Whole calendars can be skipped too.
 */

export function isSyncedMeeting(meeting) {
  const id = meeting && meeting.id;
  return typeof id === "string" && (id.startsWith("gcal-") || id.startsWith("ics-"));
}

export function excludedMeetingList(settings) {
  const listed = Array.isArray(settings && settings.excludedMeetings) ? settings.excludedMeetings : [];
  const legacy = Array.isArray(settings && settings.excludedMeetingIds) ? settings.excludedMeetingIds : [];
  const byId = new Map();
  listed.forEach((entry) => {
    if (!entry) return;
    const id = typeof entry === "string" ? entry : entry.id;
    if (!id) return;
    byId.set(id, typeof entry === "string" ? { id, title: id } : { id, title: entry.title || id, date: entry.date, calendarId: entry.calendarId || "", calendarLabel: entry.calendarLabel || "" });
  });
  legacy.forEach((id) => {
    if (id && !byId.has(id)) byId.set(id, { id, title: id });
  });
  return [...byId.values()];
}

export function excludedCalendarIdSet(settings) {
  return new Set(((settings && settings.excludedCalendarIds) || []).filter(Boolean));
}

export function isIncomingExcluded(event, settings) {
  if (!event || !event.id) return false;
  if (excludedMeetingList(settings).some((e) => e.id === event.id)) return true;
  if (event.calendarId && excludedCalendarIdSet(settings).has(event.calendarId)) return true;
  return false;
}

export function visibleMeetings(meetings, settings) {
  return (meetings || []).filter((m) => !isIncomingExcluded(m, settings));
}

export function mergeSyncedMeetings(currentMeetings, incoming, settings) {
  const existing = new Map((currentMeetings || []).map((m) => [m.id, m]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  (incoming || []).forEach((event) => {
    if (!event || !event.id) return;
    if (isIncomingExcluded(event, settings)) {
      skipped += 1;
      return;
    }
    const prior = existing.get(event.id);
    if (prior) {
      existing.set(event.id, {
        ...prior,
        title: event.title,
        date: event.date,
        attendees: event.attendees,
        meetingLink: event.meetingLink || prior.meetingLink,
        notes: prior.notes || event.notes,
        calendarId: event.calendarId || prior.calendarId || "",
        calendarLabel: event.calendarLabel || prior.calendarLabel || "",
      });
      updated += 1;
    } else {
      existing.set(event.id, {
        ...event,
        followUps: event.followUps || [],
        projectId: event.projectId || null,
        calendarId: event.calendarId || "",
        calendarLabel: event.calendarLabel || "",
      });
      added += 1;
    }
  });
  return {
    meetings: [...existing.values()].sort((a, b) => b.date - a.date),
    added,
    updated,
    skipped,
  };
}

export function snapshotExcludedMeeting(meeting) {
  return {
    id: meeting.id,
    title: meeting.title || "Untitled",
    date: meeting.date || null,
    calendarId: meeting.calendarId || "",
    calendarLabel: meeting.calendarLabel || "",
  };
}

/** Hide a meeting and remember it so a later Google pull does not bring it back. */
export function excludeMeetingFromSync(meeting, { meetings, settings, patch, updateSettings, showToast }) {
  if (!meeting || !meeting.id) return;
  const next = [...excludedMeetingList(settings).filter((e) => e.id !== meeting.id), snapshotExcludedMeeting(meeting)];
  updateSettings({ excludedMeetings: next, excludedMeetingIds: next.map((e) => e.id) });
  patch({ meetings: (meetings || []).filter((m) => m.id !== meeting.id) });
  if (showToast) showToast(`Hidden “${meeting.title || "that event"}” from calendar sync.`, "success");
}

export function restoreExcludedMeeting(id, { settings, updateSettings, showToast }) {
  const next = excludedMeetingList(settings).filter((e) => e.id !== id);
  updateSettings({ excludedMeetings: next, excludedMeetingIds: next.map((e) => e.id) });
  if (showToast) showToast("It will come back on the next Google Calendar sync.", "success");
}

export function setCalendarExcluded(calendarId, excluded, { meetings, settings, patch, updateSettings }) {
  if (!calendarId) return;
  const ids = excludedCalendarIdSet(settings);
  if (excluded) ids.add(calendarId);
  else ids.delete(calendarId);
  updateSettings({ excludedCalendarIds: [...ids] });
  if (excluded && patch) {
    patch({ meetings: (meetings || []).filter((m) => m.calendarId !== calendarId) });
  }
}
