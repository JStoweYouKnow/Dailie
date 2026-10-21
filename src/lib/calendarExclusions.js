/**
 * Meetings pulled from Google (OAuth or an iCal feed) can be hidden so they stay
 * off the board and are skipped on the next sync. Whole calendars can be skipped too.
 *
 * A person's Google sync is personal: see calendarPrivacy for who sees the title
 * and who only sees that the time is busy.
 */

import {
  collapseMeetings,
  googleMeetingId,
  meetingSeriesKey,
  mergeMeetingRecords,
  redactMeeting,
  stampSyncedMeeting,
} from "./calendarPrivacy.js";

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

function findSyncedIndex(meetings, stamped) {
  const series = meetingSeriesKey(stamped);
  if (series) {
    const bySeries = meetings.findIndex((meeting) => meeting && meetingSeriesKey(meeting) === series);
    if (bySeries >= 0) return bySeries;
  }
  const ids = [stamped.id, ...(stamped.aliasIds || [])].filter(Boolean);
  return meetings.findIndex((meeting) => meeting && ids.includes(meeting.id));
}

/**
 * Pull a calendar into the board.
 * `syncedBy` is the signed-in member. `source: "feed"` marks a studio iCal feed,
 * which stays visible to the whole team. The same occurrence from two people
 * updates one record.
 */
export function mergeSyncedMeetings(currentMeetings, incoming, settings, { syncedBy = "", team = [], source = "" } = {}) {
  const meetings = (currentMeetings || []).map((meeting) => ({ ...meeting }));
  const drop = new Set();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  (incoming || []).forEach((event) => {
    if (!event || !event.id) return;
    if (isIncomingExcluded(event, settings) || (event.aliasIds || []).some((id) => isIncomingExcluded({ id }, settings))) {
      skipped += 1;
      return;
    }
    const stamped = stampSyncedMeeting(event, { syncedBy, team, source: source || event.source || "" });
    const idx = findSyncedIndex(meetings, stamped);
    const stored = { ...stamped };
    delete stored.aliasIds;
    if (idx >= 0) {
      const prior = meetings[idx];
      const merged = mergeMeetingRecords(prior, stored, team);
      merged.id = prior.id;
      meetings[idx] = merged;
      updated += 1;
      [stamped.id, ...(stamped.aliasIds || [])].forEach((id) => {
        if (id && id !== prior.id) drop.add(id);
      });
      return;
    }
    const id = stamped.iCalUID ? googleMeetingId(stamped.iCalUID, stamped.date, stamped.id) : stamped.id;
    const existing = meetings.findIndex((meeting) => meeting && meeting.id === id);
    if (existing >= 0) {
      const merged = mergeMeetingRecords(meetings[existing], stored, team);
      merged.id = meetings[existing].id;
      meetings[existing] = merged;
      updated += 1;
      return;
    }
    meetings.push({
      ...stored,
      id,
      followUps: stored.followUps || [],
      projectId: stored.projectId || null,
      calendarId: stored.calendarId || "",
      calendarLabel: stored.calendarLabel || "",
    });
    added += 1;
  });
  return {
    meetings: meetings.filter((meeting) => meeting && !drop.has(meeting.id)).sort((a, b) => b.date - a.date),
    added,
    updated,
    skipped,
  };
}

/** Meetings this person may see. Busy blocks are included only when asked. */
export function meetingsForViewer(meetings, settings, viewer, team = [], { includeBusy = false } = {}) {
  const shown = collapseMeetings(visibleMeetings(meetings, settings), team)
    .map((meeting) => redactMeeting(meeting, viewer, team))
    .filter(Boolean);
  return includeBusy ? shown : shown.filter((meeting) => !meeting.busy);
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
