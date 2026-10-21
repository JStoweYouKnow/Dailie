/**
 * Google Calendar events, in the shape the board stores.
 * One occurrence keeps the iCal UID plus its start, so the same meeting on
 * two people's calendars can collapse, while a weekly series stays a series.
 */

function attendeeEmails(event) {
  const emails = [];
  for (const person of event.attendees || []) {
    if (!person || !person.email) continue;
    if (person.responseStatus === "declined") continue;
    emails.push(String(person.email).trim().toLowerCase());
  }
  return [...new Set(emails)];
}

function attendeeLine(event) {
  const people = (event.attendees || [])
    .filter((person) => person && person.responseStatus !== "declined")
    .map((person) => person.displayName || person.email)
    .filter(Boolean);
  if (people.length) return people.join(", ").slice(0, 180);
  const organiser = event.organizer && (event.organizer.displayName || event.organizer.email);
  return organiser || "Google Calendar";
}

function meetingLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = (event.conferenceData && event.conferenceData.entryPoints) || [];
  const video = entry.find((item) => item.entryPointType === "video");
  if (video && video.uri) return video.uri;
  const text = `${event.location || ""}\n${event.description || ""}`;
  const meet = text.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meet) return meet[0];
  const zoom = text.match(/https?:\/\/[\w.-]*zoom\.us\/(?:j|w|s|my)\/\S+/i);
  return zoom ? zoom[0].replace(/[.,;)\]]+$/, "") : "";
}

export function mapGoogleEvent(event, calendar) {
  if (!event || event.status === "cancelled") return null;
  const self = (event.attendees || []).find((person) => person && person.self);
  if (self && self.responseStatus === "declined") return null;

  const timed = event.start && event.start.dateTime;
  const allDay = event.start && event.start.date;
  if (!timed && !allDay && !event.summary) return null;
  const date = timed
    ? new Date(timed).getTime()
    : allDay
      ? new Date(`${allDay}T12:00:00`).getTime()
      : Date.now();
  const endTimed = event.end && event.end.dateTime;
  const endAllDay = event.end && event.end.date;
  const end = endTimed
    ? new Date(endTimed).getTime()
    : endAllDay
      ? new Date(`${endAllDay}T00:00:00`).getTime()
      : null;
  const where = event.location ? `Where: ${event.location}` : "";
  const calName = calendar && calendar.summary && calendar.id !== "primary" && !calendar.primary
    ? calendar.summary
    : "";
  const people = attendeeLine(event);
  const calendarId = (calendar && calendar.id) || "primary";
  const primaryId = `gcal-${event.id}`;
  const aliasIds = [primaryId];
  if (calendar && !calendar.primary && calendar.id) aliasIds.push(`gcal-${calendar.id}-${event.id}`);
  return {
    id: calendar && calendar.primary ? primaryId : (aliasIds[1] || primaryId),
    aliasIds,
    iCalUID: String(event.iCalUID || "").trim(),
    title: event.summary || "(No title)",
    date,
    end,
    allDay: !timed && !!allDay,
    attendees: calName ? `${calName} · ${people}` : people,
    attendeeEmails: attendeeEmails(event),
    organizerEmail: String((event.organizer && event.organizer.email) || "").trim().toLowerCase(),
    notes: [where, event.description].filter(Boolean).join("\n\n").slice(0, 2000) || "Synced from Google Calendar",
    meetingLink: meetingLink(event),
    followUps: [],
    projectId: null,
    calendarId,
    calendarLabel: (calendar && calendar.summary) || "",
    source: "google",
    showAsFree: event.transparency === "transparent",
  };
}
