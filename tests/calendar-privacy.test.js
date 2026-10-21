import assert from "node:assert/strict";
import test from "node:test";
import { mergeSyncedMeetings, meetingsForViewer } from "../src/lib/calendarExclusions.js";
import { meetingDayStarts, redactMeeting } from "../src/lib/calendarPrivacy.js";
import { mapGoogleEvent } from "../lib/googleCalendarEvents.js";
import { parseICSFeed } from "../src/calendarSync.js";

const team = [
  { id: "user-elena", name: "Elena Rostova", email: "elena@matriarch-studios.com" },
  { id: "user-marcus", name: "Marcus Vance", email: "marcus@matriarch-studios.com" },
  { id: "user-sarah", name: "Sarah Chen", email: "sarah@matriarch-studios.com" },
];

const when = Date.parse("2026-10-22T17:00:00.000Z");
const later = Date.parse("2026-10-29T17:00:00.000Z");

function googleEvent({ id, uid, start, summary, attendees, transparency }) {
  return mapGoogleEvent({
    id,
    iCalUID: uid,
    status: "confirmed",
    summary,
    transparency,
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(start + 60 * 60 * 1000).toISOString() },
    attendees,
    organizer: { email: "elena@matriarch-studios.com" },
  }, { id: "primary", summary: "Elena", primary: true });
}

test("another person sees a synced event as busy, without the title or join link", () => {
  const event = googleEvent({
    id: "evt-1",
    uid: "private@google.com",
    start: when,
    summary: "Doctor",
    attendees: [{ email: "elena@matriarch-studios.com", displayName: "Elena", responseStatus: "accepted" }],
  });
  const { meetings } = mergeSyncedMeetings([], [event], {}, { syncedBy: "user-elena", team, source: "google" });
  const sarah = meetingsForViewer(meetings, {}, { id: "user-sarah", email: team[2].email }, team, { includeBusy: true });
  assert.equal(sarah.length, 1);
  assert.equal(sarah[0].busy, true);
  assert.equal(sarah[0].title, "Elena · Busy");
  assert.equal(sarah[0].notes, "");
  assert.equal(sarah[0].meetingLink, "");
  assert.equal(sarah[0].attendees, "");

  const elena = meetingsForViewer(meetings, {}, { id: "user-elena", email: team[0].email }, team);
  assert.equal(elena.length, 1);
  assert.equal(elena[0].title, "Doctor");
  assert.ok(!elena[0].busy);
});

test("a shared event is one record, and only the people on it see the title", () => {
  const attendees = [
    { email: "elena@matriarch-studios.com", responseStatus: "accepted" },
    { email: "marcus@matriarch-studios.com", responseStatus: "accepted" },
    { email: "buyer@a24.com", displayName: "Buyer", responseStatus: "accepted" },
  ];
  const elenaCopy = googleEvent({ id: "elena-copy", uid: "pitch@google.com", start: when, summary: "A24 pitch", attendees });
  const marcusCopy = googleEvent({ id: "marcus-copy", uid: "pitch@google.com", start: when, summary: "A24 pitch", attendees });

  let board = mergeSyncedMeetings([], [elenaCopy], {}, { syncedBy: "user-elena", team, source: "google" });
  board = mergeSyncedMeetings(board.meetings, [marcusCopy], {}, { syncedBy: "user-marcus", team, source: "google" });
  assert.equal(board.meetings.length, 1);
  assert.ok(board.meetings[0].participantIds.includes("user-elena"));
  assert.ok(board.meetings[0].participantIds.includes("user-marcus"));

  const marcus = meetingsForViewer(board.meetings, {}, { id: "user-marcus", email: team[1].email }, team, { includeBusy: true });
  assert.equal(marcus.length, 1);
  assert.equal(marcus[0].title, "A24 pitch");
  assert.ok(!marcus[0].busy);

  const sarah = meetingsForViewer(board.meetings, {}, { id: "user-sarah", email: team[2].email }, team, { includeBusy: true });
  assert.equal(sarah.length, 1);
  assert.equal(sarah[0].busy, true);
  assert.equal(sarah[0].title, "Elena, Marcus · Busy");
  assert.doesNotMatch(sarah[0].title, /A24/);
});

test("repeating occurrences stay separate while the same occurrence collapses", () => {
  const first = googleEvent({ id: "r1", uid: "weekly@google.com", start: when, summary: "Standup", attendees: [] });
  const second = googleEvent({ id: "r2", uid: "weekly@google.com", start: later, summary: "Standup", attendees: [] });
  const again = googleEvent({ id: "r1b", uid: "weekly@google.com", start: when, summary: "Standup", attendees: [] });
  let board = mergeSyncedMeetings([], [first, second], {}, { syncedBy: "user-elena", team, source: "google" });
  assert.equal(board.meetings.length, 2);
  board = mergeSyncedMeetings(board.meetings, [again], {}, { syncedBy: "user-marcus", team, source: "google" });
  assert.equal(board.meetings.length, 2);
});

test("a free hold is not shown as busy to anyone else", () => {
  const focus = googleEvent({
    id: "free-1",
    uid: "focus@google.com",
    start: when,
    summary: "Focus",
    transparency: "transparent",
    attendees: [{ email: "elena@matriarch-studios.com", responseStatus: "accepted" }],
  });
  const { meetings } = mergeSyncedMeetings([], [focus], {}, { syncedBy: "user-elena", team, source: "google" });
  const sarah = meetingsForViewer(meetings, {}, { id: "user-sarah", email: team[2].email }, team, { includeBusy: true });
  assert.equal(sarah.length, 0);
  const elena = meetingsForViewer(meetings, {}, { id: "user-elena", email: team[0].email }, team);
  assert.equal(elena[0].title, "Focus");
});

test("a meeting typed on the board stays visible to the team", () => {
  const note = { id: "meet-1", title: "Q3 Slate Review", date: when, notes: "Festival plan", attendees: "Elena, Marcus" };
  const shown = redactMeeting(note, { id: "user-sarah", email: team[2].email }, team);
  assert.equal(shown.title, "Q3 Slate Review");
  assert.ok(!shown.busy);
});

test("a declined event is not imported", () => {
  const mapped = mapGoogleEvent({
    id: "nope",
    iCalUID: "nope@google.com",
    status: "confirmed",
    summary: "Skip",
    start: { dateTime: new Date(when).toISOString() },
    end: { dateTime: new Date(when + 3600000).toISOString() },
    attendees: [{ email: "elena@matriarch-studios.com", self: true, responseStatus: "declined" }],
  }, { id: "primary", primary: true, summary: "Elena" });
  assert.equal(mapped, null);
});

test("an all-day event covers its days and not the exclusive end date", () => {
  const start = new Date(2026, 9, 21, 12).getTime();
  const end = new Date(2026, 9, 23, 0).getTime();
  const days = meetingDayStarts({ date: start, end, allDay: true });
  assert.equal(days.length, 2);
  assert.equal(new Date(days[0]).getDate(), 21);
  assert.equal(new Date(days[1]).getDate(), 23 - 1);
});

test("an ics feed keeps the uid, attendee emails, and an exclusive all-day end", () => {
  const events = parseICSFeed([
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:studio-sync@matriarch",
    "SUMMARY:Table read",
    "DTSTART:20261021",
    "DTEND:20261022",
    "ATTENDEE;CN=Elena:mailto:elena@matriarch-studios.com",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n"));
  assert.equal(events.length, 1);
  assert.equal(events[0].iCalUID, "studio-sync@matriarch");
  assert.deepEqual(events[0].attendeeEmails, ["elena@matriarch-studios.com"]);
  assert.equal(events[0].allDay, true);
  assert.equal(new Date(events[0].end).getDate(), 22);
  assert.equal(new Date(events[0].end).getHours(), 0);
});
